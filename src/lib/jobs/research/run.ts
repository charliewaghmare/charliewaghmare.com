import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { detectAts, sameCompany, sameRequisition } from "@/lib/jobs/research/ats";
import { addUsage, estimateResearchUsd, RESEARCH_BUDGET, type Usage } from "@/lib/jobs/research/budget";
import { searchOpenAI, DEFAULT_RESEARCH_MODEL } from "@/lib/jobs/research/openai";
import { planResearch } from "@/lib/jobs/research/plan";
import type { ResearchFindings } from "@/lib/jobs/research/schema";
import { fetchPublicPage, pageSupportsPosting } from "@/lib/jobs/research/verify";
import { shouldRunResearch } from "@/lib/jobs/collect/schedule";
import { assessPosting, SCORING_VERSION, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl, inferArrangement, inferCountry } from "@/lib/jobs/collect/text";
import { decideWrite } from "@/lib/jobs/collect/dedupe";

export type ResearchSummary = {
  queries: number;
  searchCalls: number;
  candidates: number;
  verified: number;
  eligible: number;
  imported: number;
  updated: number;
  rejectedProfessional: number;
  uncertain: number;
  duplicates: number;
  companiesDiscovered: number;
  companiesAdded: number;
  boardsEnabled: number;
  errors: string[];
  estimatedUsd: number | null;
  usage: Usage;
};

type SearchFn = (query: string, track: string) => Promise<{ findings: ResearchFindings; usage: Usage }>;

export async function runResearch(options: {
  trigger: string;
  now?: Date;
  dryRun?: boolean;
  query?: string | null;
  search?: SearchFn;
  fetchImpl?: typeof fetch;
  history?: string[];
  db?: SupabaseClient | null;
}): Promise<ResearchSummary | null> {
  const now = options.now ?? new Date();
  if (!shouldRunResearch(now, options.trigger)) {
    console.log("Skipping research until Tuesday or Friday at 6:00 America/Vancouver.");
    return null;
  }
  const started = Date.now();
  const summary = emptySummary();
  const db = options.db === undefined ? (options.dryRun ? null : client()) : options.db;
  const history = options.history ?? (db ? await loadHistory(db) : []);
  const planned = planResearch({ history, focus: options.query, now });
  const search = options.search ?? defaultSearch;
  const fetchImpl = options.fetchImpl ?? fetch;
  let searches = 0;
  let searchFailures = 0;
  for (const item of planned) {
    if (Date.now() - started > RESEARCH_BUDGET.maxDurationMs) break;
    if (searches >= RESEARCH_BUDGET.maxSearchCalls) break;
    searches += 1;
    summary.queries += 1;
    try {
      const result = await search(item.query, item.track);
      summary.usage = addUsage(summary.usage, result.usage);
      summary.searchCalls += result.usage.searchCalls;
      summary.candidates += result.findings.jobs.length;
      await ingestFindings(db, result.findings, summary, fetchImpl, options.dryRun === true);
      if (db && !options.dryRun) await recordQuery(db, item, result.findings.jobs.length);
    } catch (error) {
      searchFailures += 1;
      summary.errors.push(error instanceof Error ? error.message : "Research query failed.");
    }
  }
  summary.estimatedUsd = estimateResearchUsd(process.env.OPENAI_RESEARCH_MODEL ?? DEFAULT_RESEARCH_MODEL, summary.usage);
  const status =
    summary.queries === 0 || searchFailures === summary.queries
      ? "failed"
      : searchFailures > 0
        ? "partial"
        : "success";
  if (!options.dryRun && db) await recordRun(db, summary, status);
  return summary;
}

async function ingestFindings(
  db: SupabaseClient | null,
  findings: ResearchFindings,
  summary: ResearchSummary,
  fetchImpl: typeof fetch,
  dryRun: boolean,
): Promise<void> {
  for (const job of findings.jobs) {
    if (summary.verified >= RESEARCH_BUDGET.maxCandidates) break;
    const checked = await verifyJob(job, fetchImpl);
    if (!checked.ok) {
      summary.errors.push(`${job.employer}: ${checked.reason}`);
      continue;
    }
    summary.verified += 1;
    const posting = checked.posting;
    const assessment = assessPosting(posting);
    if (!assessment.publish) {
      if (assessment.status === "uncertain") summary.uncertain += 1;
      else summary.rejectedProfessional += 1;
      continue;
    }
    summary.eligible += 1;
    if (dryRun || !db) continue;
    const outcome = await saveJob(db, posting, assessment.score, assessment);
    if (outcome === "duplicate") summary.duplicates += 1;
    if (outcome === "inserted") summary.imported += 1;
    if (outcome === "updated") summary.updated += 1;
  }
  for (const company of findings.companies) {
    if (summary.companiesAdded >= RESEARCH_BUDGET.maxCompanyAdds) break;
    summary.companiesDiscovered += 1;
    const verified = await verifyCompany(company, fetchImpl);
    if (!verified.ok) {
      summary.errors.push(`${company.name}: ${verified.reason}`);
      continue;
    }
    if (dryRun || !db) {
      summary.companiesAdded += 1;
      if (verified.board) summary.boardsEnabled += 1;
      continue;
    }
    const added = await saveCompany(db, company, verified);
    if (added.added) summary.companiesAdded += 1;
    if (added.board) summary.boardsEnabled += 1;
  }
}

async function verifyJob(
  job: ResearchFindings["jobs"][number],
  fetchImpl: typeof fetch,
): Promise<{ ok: true; posting: CollectedPosting } | { ok: false; reason: string }> {
  let page;
  try {
    page = await fetchPublicPage(job.sourceUrl, fetchImpl);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not fetch the posting." };
  }
  if (!page.ok) return page;
  const supported = pageSupportsPosting({ title: job.title, quote: job.evidenceQuote, text: page.text });
  if (!supported.ok) return supported;
  const sourceUrl = canonicalUrl(job.sourceUrl);
  const country = job.country ?? inferCountry(job.location);
  return {
    ok: true,
    posting: {
      provider: "web",
      sourceId: createHash("sha256").update(sourceUrl ?? job.sourceUrl).digest("hex").slice(0, 24),
      title: job.title,
      companyName: job.employer,
      location: job.location,
      country,
      workArrangement: inferArrangement(job.location, null),
      description: supported.text.slice(0, 12000),
      departments: [],
      sourceUrl,
      applicationUrl: canonicalUrl(job.applicationUrl) ?? sourceUrl,
      postedOn: null,
      employmentType: job.employmentType,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    },
  };
}

async function verifyCompany(
  company: ResearchFindings["companies"][number],
  fetchImpl: typeof fetch,
): Promise<{ ok: true; board: ReturnType<typeof detectAts> } | { ok: false; reason: string }> {
  let site;
  try {
    site = await fetchPublicPage(company.website, fetchImpl);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not fetch the company site." };
  }
  if (!site.ok) return site;
  const token = company.name.toLowerCase().split(/\s+/).find((word) => word.length > 3);
  if (token && !site.text.toLowerCase().includes(token)) {
    return { ok: false, reason: "The website did not mention the company name." };
  }
  const hinted = company.atsProvider && company.atsBoardId ? { provider: company.atsProvider, boardId: company.atsBoardId } : null;
  const detected = detectAts(company.careersUrl) ?? hinted;
  if (detected) {
    const live = await boardResponds(detected, fetchImpl);
    if (!live) return { ok: true, board: null };
    return { ok: true, board: detected };
  }
  return { ok: true, board: null };
}

async function boardResponds(board: { provider: string; boardId: string }, fetchImpl: typeof fetch): Promise<boolean> {
  const url =
    board.provider === "greenhouse"
      ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs`
      : board.provider === "lever"
        ? `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json&limit=1`
        : `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}`;
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "charliewaghmare-jobs/1.0" } });
    if (!response.ok) return false;
    const payload = await response.json();
    if (Array.isArray(payload)) return true;
    return Boolean(payload && typeof payload === "object" && Array.isArray((payload as { jobs?: unknown }).jobs));
  } catch {
    return false;
  }
}

async function saveJob(
  db: SupabaseClient,
  posting: CollectedPosting,
  score: number,
  assessment: ReturnType<typeof assessPosting>,
): Promise<"inserted" | "updated" | "duplicate"> {
  const companyId = await ensureCompany(db, posting.companyName, null, null, posting.location, false);
  const sourceUrl = posting.sourceUrl;
  const [{ data: byIdentity }, { data: byUrl }, { data: suppressed }, { data: siblings }] = await Promise.all([
    db.from("jobs").select("id").eq("source", "web").eq("source_id", posting.sourceId).maybeSingle(),
    sourceUrl ? db.from("jobs").select("id").eq("source_url", sourceUrl).maybeSingle() : Promise.resolve({ data: null }),
    db.from("job_suppressions").select("id").eq("source_url", sourceUrl).maybeSingle(),
    db.from("jobs").select("id, title, location, companies(name)").eq("company_id", companyId).limit(20),
  ]);
  const secondary = (siblings ?? []).find((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return sameRequisition(
      { company: posting.companyName, title: posting.title, location: posting.location },
      { company: company?.name ?? posting.companyName, title: row.title, location: row.location },
    );
  });
  const decision = decideWrite({
    existingByIdentity: Boolean(byIdentity || secondary),
    existingByUrl: Boolean(byUrl),
    suppressed: Boolean(suppressed),
  });
  if (decision.action === "skip") return "duplicate";
  const nowIso = new Date().toISOString();
  const existingId = byIdentity?.id ?? byUrl?.id ?? secondary?.id;
  const row = {
    source: "web",
    source_id: posting.sourceId,
    source_url: sourceUrl,
    application_url: posting.applicationUrl,
    title: posting.title,
    company_id: companyId,
    location: posting.location,
    country: posting.country,
    work_arrangement: posting.workArrangement,
    description: posting.description,
    employment_type: posting.employmentType,
    last_verified_at: nowIso,
    match_score: score,
    score_breakdown: assessment.breakdown,
    scoring_version: SCORING_VERSION,
    recommendation: assessment.explanation,
    skill_gaps: assessment.gaps,
    category_tags: assessment.tags,
    active: !decision.keepInactive,
    lifecycle_status: decision.keepInactive ? "closed" : "active",
    verification_status: "verified",
    is_sample: false,
    updated_at: nowIso,
    raw_metadata: {
      eligibility: assessment.status,
      eligibilityReason: assessment.reason,
      classificationVersion: SCORING_VERSION,
      provenance: "web-research",
    },
  };
  if (decision.action === "update" && existingId) {
    const { error } = await db.from("jobs").update(row).eq("id", existingId);
    if (error) throw new Error(error.message);
    return "updated";
  }
  const { error } = await db.from("jobs").insert({ ...row, discovered_at: nowIso });
  if (error) throw new Error(error.message);
  await db.from("companies").update({ has_verified_opening: true, monitoring_status: "active" }).eq("id", companyId);
  return "inserted";
}

async function saveCompany(
  db: SupabaseClient,
  company: ResearchFindings["companies"][number],
  verified: { board: ReturnType<typeof detectAts> },
): Promise<{ added: boolean; board: boolean }> {
  const { data: existingRows } = await db.from("companies").select("id, name, website").eq("is_sample", false).limit(200);
  const existing = (existingRows ?? []).find((row) => sameCompany({ name: company.name, website: company.website }, row));
  const monitoring = verified.board ? "active" : company.careersUrl ? "pending" : "watching";
  const row = {
    name: company.name,
    website: canonicalUrl(company.website),
    careers_url: canonicalUrl(company.careersUrl),
    industry: company.industry,
    location: company.location,
    why_interesting: company.why,
    ats_provider: verified.board?.provider ?? null,
    ats_board_id: verified.board?.boardId ?? null,
    enabled: true,
    last_checked_at: new Date().toISOString(),
    categories: [company.industry],
    geographic_relevance: company.location,
    monitoring_status: monitoring,
    is_sample: false,
    discovery_status: "watching",
  };
  if (existing?.id) {
    const { error } = await db.from("companies").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { added: false, board: Boolean(verified.board) };
  }
  const { error } = await db.from("companies").insert(row);
  if (error) throw new Error(error.message);
  return { added: true, board: Boolean(verified.board) };
}

async function ensureCompany(
  db: SupabaseClient,
  name: string,
  website: string | null,
  careers: string | null,
  location: string | null,
  opening: boolean,
): Promise<string> {
  const { data } = await db.from("companies").select("id, name, website").ilike("name", name).limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: created, error } = await db
    .from("companies")
    .insert({
      name,
      website,
      careers_url: careers,
      location,
      has_verified_opening: opening,
      monitoring_status: opening ? "active" : "watching",
      is_sample: false,
      discovery_status: "watching",
      enabled: true,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not save the company.");
  return created.id as string;
}

function emptySummary(): ResearchSummary {
  return {
    queries: 0,
    searchCalls: 0,
    candidates: 0,
    verified: 0,
    eligible: 0,
    imported: 0,
    updated: 0,
    rejectedProfessional: 0,
    uncertain: 0,
    duplicates: 0,
    companiesDiscovered: 0,
    companiesAdded: 0,
    boardsEnabled: 0,
    errors: [],
    estimatedUsd: null,
    usage: { inputTokens: 0, outputTokens: 0, searchCalls: 0 },
  };
}

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function defaultSearch(query: string, track: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return searchOpenAI({ query, track, apiKey, model: process.env.OPENAI_RESEARCH_MODEL });
}

async function loadHistory(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("search_queries").select("query").order("ran_at", { ascending: false }).limit(80);
  if (error) return [];
  return (data ?? []).map((row) => String(row.query));
}

async function recordQuery(db: SupabaseClient, item: { track: string; query: string }, candidates: number): Promise<void> {
  const { error } = await db.from("search_queries").insert({ track: item.track, query: item.query, candidate_count: candidates });
  if (error) console.error("Could not store the search query.");
}

async function recordRun(db: SupabaseClient, summary: ResearchSummary, status: string): Promise<void> {
  await db.from("search_runs").insert({
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    run_type: "research",
    status,
    discovered_count: summary.candidates,
    added_count: summary.imported,
    updated_count: summary.updated,
    error: summary.errors.slice(0, 5).join("; ").slice(0, 1000) || null,
    summary: {
      ...summary,
      errors: summary.errors.slice(0, 8),
    },
  });
}
