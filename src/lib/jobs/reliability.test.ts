import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessPosting, pastTerm, SCORING_VERSION, type CollectedPosting } from "./collect/rules";
import { normalizeCountry } from "./collect/text";
import { fetchBoard, parseWorkdayBoard, titleLooksRelevant } from "./collect/fetch-source";
import { watchlist } from "./collect/watchlist";
import { upsertJob, persistCollection } from "./collect/persist";
import { discoverCommunity } from "./collect/discover";
import { selectCommunityPostings } from "./collect/community";
import { atsPostingIdentity } from "./research/ats";
import { assertPublicHttps } from "./research/safety";
import { fetchPublicPage } from "./research/verify";
import { structuredPosting } from "./research/structured";
import { searchOpenAI, ResearchResponseError } from "./research/openai";
import { runResearch } from "./research/run";
import { planResearch } from "./research/plan";
import { seasonsFor } from "./research/tracks";
import { auditInventory } from "./inventory";

const now = new Date("2026-11-12T18:00:00Z");
const posting = (overrides: Partial<CollectedPosting> = {}): CollectedPosting => ({
  provider: "greenhouse", sourceId: "101", title: "Mechanical Engineering Intern", companyName: "Northline",
  location: "Toronto", country: "Canada", workArrangement: "onsite", description: "Currently enrolled undergraduate students work on mechanical engineering and product development during this internship.",
  departments: [], sourceUrl: "https://job-boards.greenhouse.io/northline/jobs/101", applicationUrl: "https://job-boards.greenhouse.io/northline/jobs/101",
  postedOn: null, employmentType: "Internship", salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, ...overrides,
});
const company = { ...watchlist[0], name: "Northline", boardId: "northline" };
type Row = Record<string, unknown>;

/** Small fluent Supabase fake: exercises actual persistence paths without external writes. */
function database(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { companies: [{ id: "company", name: "Northline", enabled: true }], jobs: [], job_suppressions: [], ...initial };
  const writes: { table: string; action: string; row: Row }[] = [];
  let failure: string | null = null;
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let action = "read";
    let payload: Row = {};
    let one = false;
    let start = 0;
    let end = Infinity;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => key === "raw_metadata->>allowInternational" ? String((row.raw_metadata as Row | undefined)?.allowInternational) === value : row[key] === value); return query; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      order: () => query,
      limit: (count: number) => { end = count - 1; return query; },
      maybeSingle: () => { one = true; return query; },
      single: () => { one = true; return query; },
      update: (row: Row) => { action = "update"; payload = row; return query; },
      insert: (row: Row) => { action = "insert"; payload = row; return query; },
      then: (resolve: (value: { data: unknown; error: { message: string } | null; count: number }) => unknown) => {
        if (failure) return Promise.resolve(resolve({ data: null, error: { message: failure }, count: 0 }));
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))).slice(start, end + 1);
        if (action === "update") { writes.push({ table, action, row: payload }); rows.forEach((row) => Object.assign(row, payload)); }
        if (action === "insert") { const created = { id: `new-${writes.length}`, ...payload }; (tables[table] ??= []).push(created); rows.splice(0, rows.length, created); writes.push({ table, action, row: payload }); }
        return Promise.resolve(resolve({ data: one ? rows[0] ?? null : rows, error: null, count: rows.length }));
      },
    };
    return query;
  };
  return { db: { from } as unknown as SupabaseClient, tables, writes, fail: (message: string) => { failure = message; } };
}

test("terms expire at season end, country codes normalize, and enrichment recognizes student variants", () => {
  assert.equal(pastTerm("Winter 2027", new Date("2027-02-01")), false);
  assert.equal(pastTerm("Winter 2027", new Date("2027-04-01")), true);
  assert.equal(pastTerm("Summer 2027", new Date("2027-06-01")), false);
  assert.equal(pastTerm("Summer 2027", new Date("2027-09-01")), true);
  assert.equal(normalizeCountry("ca"), "Canada");
  assert.equal(assessPosting(posting({ country: "ca", location: "Waterloo", title: "Software Intern" }), now).publish, true);
  for (const title of ["Summer Analyst", "Industrial Placement", "Undergraduate Research Assistant"]) assert.equal(titleLooksRelevant(title), true);
  assert.deepEqual(seasonsFor(new Date("2027-11-01")), ["Summer 2028", "Fall 2028", "Winter 2029"]);
});

test("public verification accepts ordinary fc/fd domain names, rejects IPv6/private URLs and oversized pages", async () => {
  assert.doesNotThrow(() => assertPublicHttps("https://fdata.com/jobs/1"));
  assert.throws(() => assertPublicHttps("https://[::1]/jobs/1"));
  assert.throws(() => assertPublicHttps("https://[::ffff:127.0.0.1]/jobs/1"));
  const result = await fetchPublicPage("https://example.com/jobs/1", async () => new Response("x".repeat(500_001)));
  assert.equal(result.ok, false);
  await assert.rejects(fetchPublicPage("https://example.com/jobs/1", async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/x" } })));
});

test("shared writes preserve employer records, distinct requisitions, source suppression and fail closed on lookups", async () => {
  const existing = { id: "employer", source: "greenhouse", source_id: "101", source_url: posting().sourceUrl, company_id: "company", title: posting().title, location: "Toronto", active: true };
  const store = database({ jobs: [existing] });
  assert.equal(await upsertJob(store.db, "company", posting({ provider: "web", sourceId: "web:1" }), assessPosting(posting(), now)), "duplicate");
  assert.equal(store.writes.length, 0);
  assert.equal(await upsertJob(store.db, "company", posting({ sourceId: "102", sourceUrl: "https://example.com/jobs/102" }), assessPosting(posting(), now)), "inserted");
  assert.equal(store.tables.jobs.length, 2);
  store.tables.job_suppressions.push({ source: "web", source_id: "old", source_url: "https://example.com/jobs/103" });
  assert.equal(await upsertJob(store.db, "company", posting({ sourceId: "103", sourceUrl: "https://example.com/jobs/103" }), assessPosting(posting(), now)), "skipped");
  store.fail("Database unavailable");
  await assert.rejects(upsertJob(store.db, "company", posting(), assessPosting(posting(), now)), /lookup failed/);
});

test("incomplete snapshots never close jobs; complete snapshots do; custom international scope survives reclassification", async () => {
  const row = { id: "job", company_id: "company", source: "greenhouse", source_id: "old", title: "Software Intern", description: posting().description,
    country: "United States", location: "Boston, MA", employment_type: "Internship", active: true, lifecycle_status: "active", miss_count: 1,
    is_sample: false, raw_metadata: { allowInternational: true, provenance: "web-research" } };
  const store = database({ jobs: [{ ...row }] });
  const result = { company, ok: true, error: null, postings: [], complete: false };
  await persistCollection(store.db, [result]);
  assert.equal(store.tables.jobs[0].active, true);
  assert.equal((store.tables.jobs[0].raw_metadata as Row).allowInternational, true);
  assert.equal(store.tables.jobs[0].scoring_version, SCORING_VERSION);
  await persistCollection(store.db, [{ ...result, complete: true }]);
  assert.equal(store.tables.jobs[0].active, false);
  assert.equal(store.tables.jobs[0].lifecycle_status, "closed");
});

test("malformed boards fail rather than appearing empty; full boards report completeness", async () => {
  await assert.rejects(fetchBoard(company, async () => Response.json({ unexpected: [] })));
  assert.equal(parseWorkdayBoard("evil.example?x=.myworkdayjobs.com/tenant/site"), null);
  const snapshot = { complete: false };
  await fetchBoard(company, async () => Response.json({ jobs: [] }), snapshot);
  assert.equal(snapshot.complete, true);
});

test("unknown feed employers become verified board sources without AI; failed known boards are retried", async () => {
  const feed = selectCommunityPostings({ listings: [{ company: "Northline", title: posting().title, url: posting().sourceUrl,
    status: "open", level: "intern", location_display: "Toronto, Canada", identity: "101" }] }, { skipBoards: new Set(), now });
  let calls = 0;
  const fetched = async () => { calls += 1; return Response.json({ jobs: [{ id: 101, title: posting().title, absolute_url: posting().sourceUrl, content: posting().description, location: { name: "Toronto, Canada" } }] }); };
  const result = await discoverCommunity(feed, [{ company, ok: false, error: "503", postings: [] }], fetched, now);
  assert.equal(calls, 1);
  assert.equal(result.results[0]?.company.boardId, "northline");
  assert.equal(result.results[0]?.postings[0].provider, "greenhouse");
  await discoverCommunity(feed, result.results, fetched, now);
  assert.equal(calls, 1);
});

test("structured employer pages require visible titles, employer ownership and current student evidence", () => {
  const structured = { "@type": "JobPosting", title: posting().title, description: posting().description,
    hiringOrganization: { name: "Northline", sameAs: "https://northline.example" }, jobLocation: { address: { addressLocality: "Toronto", addressCountry: "CA" } }, validThrough: "2027-09-01" };
  const make = (value: Row) => structuredPosting({ html: `<script type="application/ld+json">${JSON.stringify(value)}</script>`, visibleText: posting().title,
    url: "https://northline.example/careers/101", title: posting().title, employer: "Northline", now });
  assert.equal(make(structured)?.country, "Canada");
  assert.equal(make({ ...structured, validThrough: "2020-01-01" }), null);
  assert.equal(make({ ...structured, hiringOrganization: { name: "Northline", sameAs: "https://someoneelse.example" } }), null);
});

test("depth tool caps reach the request and malformed model responses retain usage", async () => {
  let tools = 0;
  await assert.rejects(searchOpenAI({ query: "internships", track: "manual", apiKey: "test", maxToolCalls: 1,
    fetchImpl: async (_url, init) => { tools = JSON.parse(String(init?.body)).max_tool_calls;
      return Response.json({ output_text: "invalid", usage: { input_tokens: 123, output_tokens: 45 }, output: [{ type: "web_search_call" }] }); },
  }), (error: unknown) => error instanceof ResearchResponseError && error.usage.inputTokens === 123 && error.usage.searchCalls === 1);
  assert.equal(tools, 1);
});

test("inventory audit shares source requests and does not label unverified roles genuine", async () => {
  let calls = 0;
  const results = await auditInventory([{ id: "one", posting: posting() }, { id: "two", posting: posting({ sourceId: "102", sourceUrl: "https://job-boards.greenhouse.io/northline/jobs/102", applicationUrl: null }) }], {
    verify: true, now, fetchImpl: async () => { calls += 1; return Response.json({ jobs: [{ id: 101, title: posting().title, absolute_url: posting().sourceUrl, content: posting().description, location: { name: "Toronto, Canada" } }] }); },
  });
  assert.equal(calls, 1);
  assert.equal(results[0].verdict, "verified_student");
  assert.equal(results[1].verdict, "not_on_complete_board");
});

test("exhausted research queries become eligible again after the cooldown", () => {
  const tracks = [{ id: "mechanical", label: "Mechanical", interest: "high" as const, queries: ["mechanical internship Canada"] }];
  const old = [{ query: tracks[0].queries[0], ranAt: "2026-09-01T00:00:00Z" }];
  assert.equal(planResearch({ tracks, history: old, now }).length, 1);
  assert.equal(planResearch({ tracks, history: [{ ...old[0], ranAt: now.toISOString() }], now }).length, 0);
});

test("collection preserves explicit custom geography when refreshing employer evidence", async () => {
  const live = posting({ title: "Software Intern", country: "United States", location: "Boston, MA" });
  const store = database({ jobs: [{ id: "job", company_id: "company", source: live.provider, source_id: live.sourceId,
    source_url: live.sourceUrl, title: live.title, description: live.description, active: true,
    lifecycle_status: "active", is_sample: false, raw_metadata: { allowInternational: true } }] });
  await persistCollection(store.db, [{ company, ok: true, error: null, postings: [live], complete: true }]);
  assert.equal(store.tables.jobs[0].active, true);
  assert.equal((store.tables.jobs[0].raw_metadata as Row).allowInternational, true);
});

test("failed research verifications consume the HTTP verification cap", async () => {
  let fetches = 0;
  let queries = 0;
  const summary = await runResearch({ trigger: "manual", dryRun: true, db: null, history: [], now,
    fetchImpl: async () => { fetches += 1; return new Response("missing", { status: 404 }); },
    search: async () => { queries += 1; return { usage: { inputTokens: 1, outputTokens: 1, searchCalls: 0 }, findings: {
      jobs: Array.from({ length: 8 }, (_, index) => ({ title: posting().title, employer: "Northline", location: "Toronto", country: "Canada",
        sourceUrl: `https://example.com/jobs/${queries}-${index}`, applicationUrl: `https://example.com/jobs/${queries}-${index}`,
        evidenceQuote: posting().description, employmentType: "Internship" })), companies: [],
    } }; },
  });
  assert.equal(fetches, 8);
  assert.equal(summary?.verificationAttempts, 8);
  assert.equal(summary?.verified, 0);
});

test("ATS identity matches apply aliases but separates different postings and generic boards", () => {
  assert.equal(atsPostingIdentity("https://jobs.ashbyhq.com/northline"), null);
  assert.equal(atsPostingIdentity("https://job-boards.greenhouse.io/northline"), null);
  assert.equal(atsPostingIdentity("https://jobs.ashbyhq.com/northline/job-1/application"), atsPostingIdentity("https://jobs.ashbyhq.com/northline/job-1"));
  assert.notEqual(atsPostingIdentity("https://jobs.ashbyhq.com/northline/job-1"), atsPostingIdentity("https://jobs.ashbyhq.com/northline/job-2"));
});
