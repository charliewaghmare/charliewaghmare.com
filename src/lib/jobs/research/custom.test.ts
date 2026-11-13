import assert from "node:assert/strict";
import test from "node:test";
import { assessPosting, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { sortShortlist } from "@/lib/jobs/filter";
import { appliedThisWeek, pageOf, vancouverWeekStart } from "@/lib/jobs/progress";
import type { JobListing } from "@/lib/jobs/types";
import { DEPTH_LIMITS, customScope, planCustomQueries } from "./depth";
import { runResearch } from "./run";

function posting(overrides: Partial<CollectedPosting>): CollectedPosting {
  return {
    provider: "web",
    sourceId: "1",
    title: "Finance Intern",
    companyName: "Example",
    location: "New York, NY",
    country: "United States",
    workArrangement: "onsite",
    description:
      "This is a 12-week summer internship for students currently enrolled in university. The intern returns to school when the term ends.",
    departments: [],
    sourceUrl: "https://example.com/jobs/1",
    applicationUrl: "https://example.com/jobs/1",
    postedOn: "2026-11-01",
    employmentType: "Internship",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...overrides,
  };
}

test("custom depth ceilings stay at the requested preset", () => {
  assert.equal(DEPTH_LIMITS.quick.maxSpendUsd, 0.1);
  assert.equal(DEPTH_LIMITS.quick.maxSearchCalls, 1);
  assert.equal(DEPTH_LIMITS.standard.maxSpendUsd, 0.35);
  assert.equal(DEPTH_LIMITS.standard.maxSearchCalls, 2);
  assert.equal(DEPTH_LIMITS.deep.maxSpendUsd, 0.75);
  assert.equal(DEPTH_LIMITS.deep.maxSearchCalls, 4);
  assert.equal(planCustomQueries("Find NASCAR engineering internships in the United States", "quick").length, 1);
  assert.equal(planCustomQueries("Find NASCAR engineering internships in the United States", "deep").length, 4);
});

test("a custom location request can publish an international student role", () => {
  const now = new Date("2026-11-12T18:00:00Z");
  const role = posting({});
  assert.equal(assessPosting(role, now).publish, false);
  assert.equal(customScope("Find NASCAR engineering internships in the United States").allowInternational, true);
  assert.equal(customScope("Find finance internships in Canada only").allowInternational, false);
  assert.equal(assessPosting(role, now, { allowInternational: true }).publish, true);
});

test("application week follows America/Vancouver", () => {
  const thursday = new Date("2026-11-12T18:00:00Z");
  assert.equal(vancouverWeekStart(thursday), "2026-11-09");
  assert.equal(appliedThisWeek("2026-11-09", thursday), true);
  assert.equal(appliedThisWeek("2026-11-08", thursday), false);
  assert.equal(appliedThisWeek(null, thursday), false);
});

test("pages do not overlap and shortlist keeps verified deadlines first", () => {
  const items = ["a", "b", "c", "d", "e"];
  const first = pageOf(items, 2);
  const second = pageOf(items, 4);
  assert.deepEqual(first.visible, ["a", "b"]);
  assert.equal(second.visible.slice(0, 2).join(), first.visible.join());
  assert.equal(second.total, 5);
  const early = { deadline: "2026-12-01", savedAt: "2026-11-02", discoveredOn: "2026-11-01", matchScore: 10 } as JobListing;
  const laterSaved = { deadline: null, savedAt: "2026-11-10", discoveredOn: "2026-11-01", matchScore: 90 } as JobListing;
  assert.equal(sortShortlist([laterSaved, early])[0]?.deadline, "2026-12-01");
});

test("quick custom research makes one model call", async () => {
  let calls = 0;
  const summary = await runResearch({
    trigger: "workflow_dispatch",
    dryRun: true,
    query: "Find mechanical product design co-ops around Toronto",
    depth: "quick",
    db: null,
    search: async () => {
      calls += 1;
      return {
        usage: { inputTokens: 100, outputTokens: 20, searchCalls: 1 },
        findings: { jobs: [], companies: [] },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary?.depth, "quick");
  assert.equal(summary?.queries, 1);
});
