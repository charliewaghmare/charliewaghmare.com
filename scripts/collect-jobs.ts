import { collectJobs } from "../src/lib/jobs/collect/run";

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;
const dryRun = process.argv.includes("--dry-run");

collectJobs({
  trigger: process.env.COLLECT_TRIGGER ?? "manual",
  runId: process.env.COLLECT_RUN_ID || null,
  only,
  dryRun,
})
  .then((summary) => {
    if (!summary) return;
    console.log(JSON.stringify(summary));
    if (summary.sourcesChecked > 0 && summary.sourcesSucceeded === 0) process.exit(1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Collection failed");
    process.exit(1);
  });
