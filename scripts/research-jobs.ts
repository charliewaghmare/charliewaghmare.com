import { runResearch } from "../src/lib/jobs/research/run";

const queryFlag = process.argv.indexOf("--query");
const query = queryFlag >= 0 ? process.argv[queryFlag + 1] : process.env.RESEARCH_QUERY;
const trigger = process.env.RESEARCH_TRIGGER ?? "manual";
const dryRun = process.argv.includes("--dry-run");
const runId = process.env.RESEARCH_RUN_ID?.trim() || null;

if (!dryRun && (trigger === "schedule" || !runId || !query?.trim())) {
  console.log("Research runs only when a search is started from the jobs page.");
  process.exit(0);
}

runResearch({
  trigger,
  dryRun,
  query: query?.trim() ? query.trim() : null,
  depth: process.env.RESEARCH_DEPTH?.trim() || null,
  runId,
})
  .then((summary) => {
    if (!summary) return;
    console.log(JSON.stringify(summary));
    if (summary.queries > 0 && summary.errors.length >= summary.queries && summary.verified === 0) {
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Research failed");
    process.exit(1);
  });
