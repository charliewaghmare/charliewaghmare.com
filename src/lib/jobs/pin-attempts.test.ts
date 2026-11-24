import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { POST } from "@/app/api/jobs/session/route";
import { checkPinAttempt } from "./pin-attempts";
import { PIN_GLOBAL_LIMIT, PIN_IP_LIMIT, PIN_WINDOW_MS, hashPin, readSessionExpiry } from "./security";

const pinHash = hashPin("4821");
type Attempt = { id: number; attempted_at: string; ip_hash: string; success: boolean };

// Exercise the real Supabase query builder against a shared, controllable primary.
// Separate clients share committed rows, as separate server instances must.
function database(now = Date.parse("2026-11-24T12:14:59Z")) {
  const rows: Attempt[] = [];
  let fail: "insert" | "count" | "update" | "missing-count" | "timestamp" | "network" | null = null;
  const fetchImpl: typeof fetch = async (input, init) => {
    if (fail === "network") throw new Error("Database unavailable");
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/pin_attempts");
    const method = init?.method;
    if ((method === "POST" && fail === "insert") || (method === "HEAD" && fail === "count") ||
        (method === "PATCH" && fail === "update")) return Response.json({ message: "Database failure" }, { status: 500 });
    if (method === "POST") {
      const row = { ...JSON.parse(String(init?.body)), id: rows.length + 1, attempted_at: new Date(now).toISOString() } as Attempt;
      rows.push(row);
      return Response.json(fail === "timestamp" ? { ...row, attempted_at: "invalid" } : row, { status: 201 });
    }
    if (method === "HEAD") {
      const cutoff = url.searchParams.get("attempted_at");
      assert.ok(cutoff?.startsWith("gte."), "every count must use the sliding cutoff");
      assert.equal(url.searchParams.has("success"), false, "pending and successful attempts stay in the count");
      const ip = url.searchParams.get("ip_hash");
      const count = rows.filter((row) => Date.parse(row.attempted_at) >= Date.parse(cutoff.slice(4)) &&
        (!ip || `eq.${row.ip_hash}` === ip)).length;
      return new Response(null, { headers: fail === "missing-count" ? {} : { "content-range": `*/${count}` } });
    }
    assert.equal(method, "PATCH");
    const row = rows.find((row) => `eq.${row.id}` === url.searchParams.get("id"));
    assert.ok(row);
    Object.assign(row, JSON.parse(String(init?.body)));
    return Response.json({ id: row.id });
  };
  const client = () => createClient("https://jobs.example", "test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchImpl },
  });
  return {
    rows, client, fetchImpl,
    advance: (ms: number) => { now += ms; },
    fail: (mode: typeof fail) => { fail = mode; },
  };
}

function attempt(store: ReturnType<typeof database>, ipHash = "network-a", pin = "0000") {
  return checkPinAttempt(store.client(), { ipHash, pin, pinHash });
}

test("a clock boundary does not reset the sliding window, and quiet expiry releases it", async () => {
  const store = database();
  for (let i = 0; i < PIN_IP_LIMIT; i++) assert.equal((await attempt(store)).ok, false);
  store.advance(2_000); // Cross 12:15, the boundary a fixed-window limiter would reset on.
  assert.deepEqual(await attempt(store, "network-a", "4821"), {
    ok: false, status: 429, message: "Too many attempts. Try again after 15 minutes without another attempt.",
  });
  store.advance(PIN_WINDOW_MS + 1);
  assert.deepEqual(await attempt(store, "network-a", "4821"), { ok: true });
});

test("attempts expire individually instead of clearing the entire bucket", async () => {
  const store = database();
  await attempt(store);
  store.advance(60_000);
  for (let i = 1; i < PIN_IP_LIMIT; i++) await attempt(store);
  store.advance(PIN_WINDOW_MS - 60_000 + 1);
  assert.deepEqual(await attempt(store, "network-a", "4821"), { ok: true });
  assert.equal((await attempt(store, "network-a", "4821") as { status: number }).status, 429);
});

test("the global sliding window still blocks attempts that rotate networks", async () => {
  const store = database();
  for (let i = 0; i < PIN_GLOBAL_LIMIT; i++) {
    assert.equal((await attempt(store, `network-${i}`) as { status: number }).status, 401);
  }
  store.advance(2_000);
  assert.equal((await attempt(store, "new-network", "4821") as { status: number }).status, 429);
});

test("concurrent correct PINs cannot bypass the per-network reservation limit", async () => {
  const store = database();
  const allowed = await Promise.all(Array.from({ length: PIN_IP_LIMIT }, () => attempt(store, "network-a", "4821")));
  assert.equal(allowed.filter((result) => result.ok).length, PIN_IP_LIMIT);
  const burst = await Promise.all(Array.from({ length: 40 }, () => attempt(store, "network-a", "4821")));
  assert.equal(burst.filter((result) => result.ok).length, 0);
  assert.equal(store.rows.filter((row) => row.success).length, PIN_IP_LIMIT);
  assert.equal(store.rows.length, PIN_IP_LIMIT + 40, "even blocked requests remain in the window");
});

test("a parallel burst across networks cannot exceed the global allowance", async () => {
  const store = database();
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => attempt(store, `network-${i}`, "4821")));
  assert.ok(results.filter((result) => result.ok).length <= PIN_GLOBAL_LIMIT);
  assert.ok(results.some((result) => !result.ok && result.status === 429));
});

test("malformed inputs, successes and denied attempts all count across fresh clients", async () => {
  const store = database();
  assert.deepEqual(await attempt(store, "network-a", "4821"), { ok: true });
  for (let i = 1; i < PIN_IP_LIMIT; i++) {
    assert.equal((await attempt(store, "network-a", "bad") as { status: number }).status, 400);
  }
  assert.equal((await attempt(store, "network-a", "4821") as { status: number }).status, 429);
  store.advance(PIN_WINDOW_MS - 1);
  assert.equal((await attempt(store, "network-a", "4821") as { status: number }).status, 429);
  store.advance(2); // Original attempts expired, but the two recent denials did not.
  assert.deepEqual(await attempt(store, "network-a", "4821"), { ok: true });
  assert.equal(store.rows.filter((row) => row.success).length, 2);
});

test("database insertion, count, timestamp and audit failures fail closed", async () => {
  for (const mode of ["insert", "count", "missing-count", "timestamp", "network", "update"] as const) {
    const store = database();
    store.fail(mode);
    const result = await attempt(store, "network-a", "4821");
    assert.equal(result.ok, false, mode);
    assert.equal((result as { status: number }).status, 503, mode);
  }
});

test("the session route issues a signed cookie only on an admitted correct PIN", async (t) => {
  const store = database();
  const secret = "test-session-secret";
  const settings = { SUPABASE_URL: "https://jobs.example", SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    JOBS_SESSION_SECRET: secret, JOBS_EDIT_PIN_HASH: pinHash };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  t.mock.method(globalThis, "fetch", store.fetchImpl);
  const request = (body: string) => POST(new Request("https://jobs.example/api/jobs/session", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" }, body,
  }));
  const unlocked = await request(JSON.stringify({ pin: "4821" }));
  assert.equal(unlocked.status, 200);
  const cookie = unlocked.headers.get("set-cookie")!;
  const token = cookie.match(/jobs_edit=([^;]+)/)?.[1];
  assert.ok(token && readSessionExpiry(decodeURIComponent(token), secret));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  for (const body of ["{", "null", '{"pin":"no"}', '{"pin":"0000"}']) {
    const response = await request(body);
    assert.ok([400, 401].includes(response.status));
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const blocked = await request(JSON.stringify({ pin: "4821" }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "900");
  assert.equal(blocked.headers.get("set-cookie"), null);
  store.fail("insert");
  const unavailable = await request(JSON.stringify({ pin: "4821" }));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("set-cookie"), null);
});
