import assert from "node:assert/strict";
import test from "node:test";
import { assessPosting, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { sortShortlist } from "@/lib/jobs/filter";
import { appliedThisWeek, pageOf, vancouverWeekStart } from "@/lib/jobs/progress";
import type { JobListing } from "@/lib/jobs/types";

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

test("legacy international scope can still publish a student role", () => {
  const now = new Date("2026-11-12T18:00:00Z");
  const role = posting({});
  assert.equal(assessPosting(role, now).publish, false);
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

