import assert from "node:assert/strict";
import test from "node:test";
import { decideWrite, nextLifecycle } from "./dedupe";
import { fetchBoard, SourceFailure } from "./fetch-source";
import { mapAshbyJob, mapGreenhouseJob, mapLeverJob, mapSmartRecruitersJob, mapWorkdayJob } from "./map-source";
import { parseWorkdayBoard } from "./fetch-source";
import { buildCoverageReport } from "./coverage";
import { eligibility, scorePosting, type CollectedPosting } from "./rules";
import { shouldRunScheduled } from "./schedule";
import { canonicalUrl, stripHtml } from "./text";

const now = new Date("2026-11-12T18:00:00Z");

function posting(overrides: Partial<CollectedPosting> = {}): CollectedPosting {
  return {
    provider: "greenhouse",
    sourceId: "1",
    title: "Mechanical engineering intern",
    companyName: "Northline",
    location: "Toronto, ON",
    country: "Canada",
    workArrangement: "hybrid",
    description: "Summer 2027 internship in mechanical design for a student.",
    departments: ["Engineering"],
    sourceUrl: "https://example.com/jobs/1",
    applicationUrl: "https://example.com/jobs/1/apply",
    postedOn: "2026-11-01",
    employmentType: "Internship",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    ...overrides,
  };
}

test("eligibility keeps a student mechanical role and drops a senior role", () => {
  assert.equal(eligibility(posting(), now).include, true);
  assert.equal(
    eligibility(posting({ title: "Senior mechanical engineer", description: "8 years required." }), now).include,
    false,
  );
  assert.equal(
    eligibility(posting({ description: "Summer 2026 internship for a student." }), now).include,
    false,
  );
  assert.equal(
    eligibility(
      posting({
        title: "Associate Graphic Designer",
        description: "Students are welcome. The team uses software tools.",
        employmentType: null,
      }),
      now,
    ).include,
    false,
  );
  assert.equal(
    eligibility(
      posting({
        title: "Data Annotation Specialist, Engineering (civil, mechanical, electrical, chemical)",
        description: "Label engineering documents.",
        employmentType: null,
      }),
      now,
    ).include,
    false,
  );
});

test("new source payloads keep the posting identity", () => {
  const smart = mapSmartRecruitersJob(
    {
      id: "99",
      name: "Materials engineering intern",
      releasedDate: "2026-11-01",
      location: { city: "Mississauga", country: "ca" },
      jobAd: { sections: [{ text: "<p>Summer student internship.</p>" }] },
    },
    "Continental",
    "Continental",
  );
  assert.equal(smart?.provider, "smartrecruiters");
  assert.equal(smart?.title, "Materials engineering intern");
  assert.equal(smart?.sourceUrl?.includes("smartrecruiters.com/Continental/99"), true);
  const workday = mapWorkdayJob(
    {
      jobPostingInfo: {
        title: "Footwear development undergraduate intern",
        jobReqId: "R-1",
        location: "Beaverton, Oregon",
        jobDescription: "<p>Undergraduate internship in footwear.</p>",
        externalUrl: "https://nike.wd1.myworkdayjobs.com/en-US/nke/job/1",
        startDate: "2026-10-27",
      },
    },
    "Nike",
    null,
  );
  assert.equal(workday?.provider, "workday");
  assert.equal(parseWorkdayBoard("nike.wd1.myworkdayjobs.com/nike/nke")?.site, "nke");
  assert.equal(parseWorkdayBoard("localhost/nike/nke"), null);
});

test("coverage report separates filtering from source coverage", () => {
  const report = buildCoverageReport({
    collection: {
      fetched: 100,
      eligibleStudent: 6,
      ineligibleProfessional: 80,
      uncertain: 10,
      withheldEligible: 4,
      belowThreshold: 2,
      relevant: 4,
      inserted: 3,
      duplicates: 1,
      suppressed: 0,
    },
  });
  assert.equal(report.fetched, 100);
  assert.equal(report.belowThreshold, 2);
  assert.equal(report.aboveThreshold, 4);
  assert.ok(report.verifiedSources > report.needsAttention.length);
});

test("score uses the published weights and does not invent salary", () => {
  const scored = scorePosting(posting());
  assert.ok(scored.score >= 50 && scored.score < 100);
  assert.equal(
    scored.score,
    Math.round(
      scored.breakdown.interest * 0.35 +
        scored.breakdown.location * 0.2 +
        scored.breakdown.qualifications * 0.2 +
        scored.breakdown.career * 0.2 +
        scored.breakdown.compensation * 0.05,
    ),
  );
  assert.equal(scored.breakdown.compensation, 50);
  assert.equal(scorePosting(posting({ salaryMin: 25, salaryCurrency: "CAD" })).breakdown.compensation, 70);
});

test("dedupe and lifecycle decisions", () => {
  assert.equal(decideWrite({ existingByIdentity: false, existingByUrl: false, suppressed: false }).action, "insert");
  assert.equal(decideWrite({ existingByIdentity: true, existingByUrl: false, suppressed: false }).action, "update");
  assert.equal(decideWrite({ existingByIdentity: false, existingByUrl: false, suppressed: true }).action, "skip");
  assert.deepEqual(nextLifecycle({ seen: false, sourceOk: false, missCount: 0 }).lifecycle, "active");
  assert.equal(nextLifecycle({ seen: false, sourceOk: true, missCount: 0 }).lifecycle, "stale");
  assert.equal(nextLifecycle({ seen: false, sourceOk: true, missCount: 1 }).lifecycle, "closed");
  assert.equal(nextLifecycle({ seen: true, sourceOk: true, missCount: 2 }).missCount, 0);
});

test("scheduled collector runs only at 6:00 America/Vancouver", () => {
  assert.equal(shouldRunScheduled(new Date("2026-11-12T14:00:00Z"), "schedule"), true);
  assert.equal(shouldRunScheduled(new Date("2026-11-12T13:00:00Z"), "schedule"), false);
  assert.equal(shouldRunScheduled(new Date("2026-07-12T13:00:00Z"), "schedule"), true);
  assert.equal(shouldRunScheduled(new Date("2026-11-12T13:00:00Z"), "workflow_dispatch"), true);
});

test("connectors paginate, reject bad responses, and skip unlisted Ashby jobs", async () => {
  const company = {
    name: "Example",
    website: null,
    careersUrl: null,
    provider: "lever" as const,
    boardId: "example",
    region: "global" as const,
    categories: [],
    geographicRelevance: "",
    enabled: true,
    why: "",
  };
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({
      id: `p${index}`,
      text: `Intern ${index}`,
      hostedUrl: `https://jobs.lever.co/example/${index}`,
    })),
    [{ id: "last", text: "Co-op", hostedUrl: "https://jobs.lever.co/example/last" }],
  ];
  let calls = 0;
  const postings = await fetchBoard(company, async () => {
    const body = pages[calls] ?? [];
    calls += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  assert.equal(postings.length, 101);
  assert.equal(calls, 2);

  await assert.rejects(
    () =>
      fetchBoard({ ...company, provider: "ashby", boardId: "missing" }, async () => new Response("no", { status: 404 })),
    (error: unknown) => error instanceof SourceFailure && error.status === 404,
  );
});

test("source mappers keep ids and strip html", () => {
  const greenhouse = mapGreenhouseJob(
    {
      id: 15,
      title: "Running footwear intern",
      absolute_url: "https://boards.example/jobs/15?ref=1",
      location: { name: "Vancouver, BC" },
      content: "<p>Student <b>internship</b></p>",
      company_name: "On",
    },
    "On",
  );
  assert.equal(greenhouse?.sourceId, "15");
  assert.equal(greenhouse?.description, "Student internship");
  assert.equal(canonicalUrl(greenhouse?.sourceUrl), "https://boards.example/jobs/15");
  assert.equal(
    canonicalUrl("https://zwift.com/careers?gh_jid=15&utm_source=x"),
    "https://zwift.com/careers?gh_jid=15",
  );
  const lever = mapLeverJob(
    { id: "abc", text: "Co-op", hostedUrl: "https://jobs.lever.co/acme/abc", categories: { location: "Toronto" } },
    "Acme",
  );
  assert.equal(lever?.provider, "lever");
  const hidden = mapAshbyJob({ id: "x", title: "Hidden", isListed: false }, "Whoop");
  assert.equal(hidden, null);
  assert.equal(stripHtml("<script>alert(1)</script><p>Hello</p>"), "Hello");
});
