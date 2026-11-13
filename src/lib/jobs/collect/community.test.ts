import assert from "node:assert/strict";
import test from "node:test";
import { selectCommunityPostings } from "@/lib/jobs/collect/community";
import { keepEmployerRecord } from "@/lib/jobs/collect/dedupe";

const now = new Date("2026-11-12T18:00:00Z");

function listing(overrides: Record<string, unknown>) {
  return {
    company: "Northline",
    title: "Mechanical Engineering Intern",
    url: "https://example.com/jobs/mech",
    status: "open",
    level: "intern",
    is_phd: false,
    location_display: "Toronto, Ontario, Canada",
    term: "Summer 2027",
    term_inferred: false,
    posted: { value: "2026-11-01", precision: "exact" },
    identity: "url:https://example.com/jobs/mech",
    ...overrides,
  };
}

test("community feed keeps a direct student link and drops closed, shortened, and duplicate-board rows", () => {
  const batch = selectCommunityPostings(
    {
      listings: [
        listing({}),
        listing({
          company: "Closed Co",
          title: "Software Engineering Intern",
          url: "https://example.com/jobs/closed",
          status: "closed",
          identity: "closed",
        }),
        listing({
          company: "Short",
          title: "Software Engineering Intern",
          url: "https://go.vansh.nyc/1wc",
          identity: "short",
          location_display: "Toronto, Ontario",
        }),
        listing({
          company: "Formlabs",
          title: "Materials Intern",
          url: "https://job-boards.greenhouse.io/formlabs/jobs/1",
          identity: "formlabs",
          location_display: "Somerville, MA",
        }),
        listing({
          company: "Remote Soft",
          title: "Software Engineering Intern",
          url: "https://example.com/jobs/soft",
          identity: "soft",
          location_display: "San Francisco, CA",
        }),
      ],
      closed: [{ company: "Old Co", title: "Intern", url: "https://example.com/old" }],
    },
    { skipBoards: new Set(["greenhouse:formlabs"]), now },
  );
  assert.equal(batch.stats.raw, 5);
  assert.equal(batch.stats.closed, 2);
  assert.equal(batch.stats.rejectedLink, 1);
  assert.equal(batch.stats.duplicateBoard, 1);
  assert.equal(batch.stats.geography, 1);
  assert.equal(batch.stats.kept, 1);
  assert.equal(batch.results[0]?.company.name, "Northline");
  assert.equal(batch.results[0]?.postings[0]?.applicationUrl, "https://example.com/jobs/mech");
  assert.equal(batch.results[0]?.postings[0]?.country, "Canada");
});

test("an international high-interest internship stays, and employer data is not replaced by the feed", () => {
  const batch = selectCommunityPostings(
    {
      listings: [
        listing({
          company: "Orbit",
          title: "Mechanical Engineering Intern",
          url: "https://example.com/jobs/orbit",
          identity: "orbit",
          location_display: "Los Angeles, CA",
        }),
      ],
    },
    { now },
  );
  assert.equal(batch.stats.kept, 1);
  assert.equal(keepEmployerRecord("greenhouse", "web"), true);
  assert.equal(keepEmployerRecord("web", "greenhouse"), false);
  assert.equal(keepEmployerRecord("web", "web"), false);
});
