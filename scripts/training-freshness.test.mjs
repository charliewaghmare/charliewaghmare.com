import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("production training reads are fresh on the first request", { timeout: 60_000 }, async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.ok(existsSync(join(root, ".next/BUILD_ID")), "Run the production build before this check.");
  const temp = mkdtempSync(join(tmpdir(), "training-freshness-"));
  const stateFile = join(temp, "state.json");
  const logFile = join(temp, "requests.log");
  const setState = (label, vo2 = 52, heartRate = 140, offline = false) => {
    writeFileSync(stateFile, JSON.stringify({ label, vo2, heartRate, offline }));
    writeFileSync(logFile, "");
  };
  setState("A");

  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const mock = new URL("./testing/garmin-fetch-mock.mjs", import.meta.url).href;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${mock}`,
      GARMIN_TOKEN: JSON.stringify({ di_token: "freshness-test-token" }),
      GARMIN_TEST_STATE: stateFile,
      GARMIN_TEST_LOG: logFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (server.exitCode === null) {
      const stopped = once(server, "exit");
      server.kill("SIGTERM");
      await stopped;
    }
    rmSync(temp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Production server did not start:\n${output}`)), 15_000);
    const ready = (chunk) => {
      if (!chunk.toString().includes("Ready")) return;
      clearTimeout(timer);
      server.stdout.off("data", ready);
      resolve();
    };
    server.stdout.on("data", ready);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
  });

  const page = async (path, label, vo2) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store|private/, "full responses must not be cached by a browser/CDN");
    const html = await response.text();
    assert.ok(html.includes(`Fresh Run ${label}`), `${path} must show the changed Garmin run immediately`);
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    if (vo2 !== undefined) assert.match(text, new RegExp(`VO2 max\\s*\\+\\s*${vo2}\\b`));
    return html;
  };
  await t.test("both pages read changed runs and metrics without a refresh or background revalidation", async () => {
    await page("/training", "A", 52);
    await page("/", "A");
    setState("B", 57, 155);
    await page("/", "B");
    const homeRequests = readFileSync(logFile, "utf8");
    assert.ok(homeRequests.includes("/activities/search/activities"));
    assert.doesNotMatch(homeRequests, /socialProfile|metrics-service|userstats-service|hrv-service|sleep-service|biometric-service/);
    await page("/training", "B", 57);
    setState("C", 61, 160);
    await page("/training", "C", 61);
    await page("/", "C");
  });
  await t.test("historical run details also reflect Garmin edits on their first request", async () => {
    for (const heartRate of [161, 165]) {
      setState("C", 61, heartRate);
      const response = await fetch(`http://127.0.0.1:${port}/api/training/activities/910000000`);
      assert.equal(response.status, 200);
      const { activity } = await response.json();
      assert.equal(activity.samples[0].heartRate, heartRate);
      assert.equal(activity.splits[0].heartRateLabel, `${heartRate} bpm`);
    }
  });
  await t.test("outages do not replay old snapshots or cache the failure after recovery", async () => {
    setState("C", 61, 160, true);
    for (const path of ["/", "/training"]) {
      const html = await (await fetch(`http://127.0.0.1:${port}${path}`)).text();
      assert.ok(!html.includes("Fresh Run C"), `${path} replayed stale data during an outage`);
      assert.ok(html.includes("No recent run"));
    }
    setState("D", 63, 170);
    await page("/", "D");
    await page("/training", "D", 63);
  });
});
