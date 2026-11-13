import { runResearch } from "../src/lib/jobs/research/run";

const queryFlag = process.argv.indexOf("--query");
const query = queryFlag >= 0 ? process.argv[queryFlag + 1] : process.env.RESEARCH_QUERY;

runResearch({
  trigger: process.env.RESEARCH_TRIGGER ?? "manual",
  dryRun: process.argv.includes("--dry-run"),
  query: query?.trim() ? query.trim() : null,
  depth: process.env.RESEARCH_DEPTH?.trim() || null,
  runId: process.env.RESEARCH_RUN_ID?.trim() || null,
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
