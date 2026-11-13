import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { detectAts, sameCompany, sameRequisition } from "@/lib/jobs/research/ats";
import { addUsage, estimateResearchUsd, researchLimits, type Usage } from "@/lib/jobs/research/budget";
import { DEPTH_LIMITS, customScope, parseDepth, planCustomQueries, type ResearchDepth } from "@/lib/jobs/research/depth";
import { searchOpenAI, DEFAULT_RESEARCH_MODEL } from "@/lib/jobs/research/openai";
import { planResearch } from "@/lib/jobs/research/plan";
import { screenCandidate } from "@/lib/jobs/research/screen";
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
  companiesWithoutOpenings: number;
  screenedOut: number;
  boardsEnabled: number;
  belowThreshold: number;
  withheld: number;
  errors: string[];
  estimatedUsd: number | null;
  depth: ResearchDepth | null;
  results: ResearchResult[];
  usage: Usage;
};

export type ResearchResult = {
  title: string;
  employer: string;
  url: string | null;
  score: number;
  outcome: "inserted" | "updated" | "duplicate" | "eligible";
  belowThreshold: boolean;
};

type SearchFn = (query: string, track: string) => Promise<{ findings: ResearchFindings; usage: Usage }>;

export async function runResearch(options: {
  trigger: string;
  now?: Date;
  dryRun?: boolean;
  query?: string | null;
  depth?: string | null;
  runId?: string | null;
  search?: SearchFn;
  fetchImpl?: typeof fetch;
  history?: string[];
  db?: SupabaseClient | null;
}): Promise<ResearchSummary | null> {
  const now = options.now ?? new Date();
  if (!shouldRunResearch(now, options.trigger)) {
    console.log("Skipping scheduled research. Start a search from the jobs page.");
    return null;
  }
  const started = Date.now();
  const depth = parseDepth(options.depth);
  const limits = depth ? DEPTH_LIMITS[depth] : researchLimits();
  const summary = emptySummary(depth);
  const db = options.db === undefined ? (options.dryRun ? null : client()) : options.db;
  if (db && options.runId && !options.dryRun) {
    const claimed = await claimRun(db, options.runId);
    if (!claimed) {
      console.log("Research run was already claimed.");
      return null;
    }
  }
  const history = options.history ?? (db && !options.query ? await loadHistory(db) : []);
  const coverage = db && !options.query ? await loadCoverageCounts(db) : {};
  const knownCompanies = db ? await loadKnownCompanies(db) : [];
  const scope = options.query ? customScope(options.query) : { allowInternational: false };
  const planned = options.query
    ? planCustomQueries(options.query, depth ?? "quick")
    : planResearch({
        history,
        now,
        coverage,
        tracksPerRun: researchLimits().tracksPerRun,
        queriesPerTrack: researchLimits().queriesPerTrack,
      });
  const search = options.search ?? defaultSearch;
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = process.env.OPENAI_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_MODEL;
  let searches = 0;
  let searchFailures = 0;
  for (const item of planned) {
    if (Date.now() - started > limits.maxDurationMs) break;
    if (searches >= limits.maxSearchCalls) break;
    const spent = estimateResearchUsd(model, summary.usage);
    if (spent != null && spent >= limits.maxSpendUsd && searches > 0) {
      summary.errors.push(`Stopped at about $${spent}, under the $${limits.maxSpendUsd} run cap.`);
      break;
    }
    searches += 1;
    summary.queries += 1;
    try {
      const result = await search(item.query, item.track);
      summary.usage = addUsage(summary.usage, result.usage);
      summary.searchCalls += result.usage.searchCalls;
      summary.candidates += result.findings.jobs.length;
      await ingestFindings(
        db,
        result.findings,
        summary,
        fetchImpl,
        options.dryRun === true,
        knownCompanies,
        limits.maxCandidates,
        limits.maxCompanyAdds,
        scope.allowInternational,
      );
      if (db && !options.dryRun && !options.query) await recordQuery(db, item, result.findings.jobs.length);
    } catch (error) {
      searchFailures += 1;
      summary.errors.push(error instanceof Error ? error.message : "Research query failed.");
    }
  }
  summary.estimatedUsd = estimateResearchUsd(model, summary.usage);
  const status =
    summary.queries === 0 || searchFailures === summary.queries
      ? "failed"
      : searchFailures > 0
        ? "partial"
        : "success";
  if (!options.dryRun && db) await recordRun(db, summary, status, options.runId ?? null, options.query ?? null);
  return summary;
}

async function ingestFindings(
  db: SupabaseClient | null,
  findings: ResearchFindings,
  summary: ResearchSummary,
  fetchImpl: typeof fetch,
  dryRun: boolean,
  knownCompanies: { name: string; website: string | null }[],
  maxCandidates: number,
  maxCompanyAdds: number,
  allowInternational: boolean,
): Promise<void> {
  const seenUrls = new Set<string>();
  for (const job of findings.jobs) {
    if (summary.verified >= maxCandidates) break;
    const screened = screenCandidate(job, seenUrls);
    if (!screened.ok) {
      summary.screenedOut += 1;
      summary.errors.push(`${job.employer}: ${screened.reason}`);
      continue;
    }
    const checked = await verifyJob(job, fetchImpl);
    if (!checked.ok) {
      summary.errors.push(`${job.employer}: ${checked.reason}`);
      continue;
    }
    summary.verified += 1;
    const posting = checked.posting;
    const assessment = assessPosting(posting, new Date(), { allowInternational });
    if (!assessment.publish) {
      if (assessment.status === "uncertain") summary.uncertain += 1;
      else if (assessment.status === "eligible_student_role") summary.withheld += 1;
      else summary.rejectedProfessional += 1;
      continue;
    }
    summary.eligible += 1;
    const below = assessment.score < 50;
    if (below) summary.belowThreshold += 1;
    const outcome = dryRun || !db ? "eligible" : await saveJob(db, posting, assessment.score, assessment);
    if (outcome === "duplicate") summary.duplicates += 1;
    if (outcome === "inserted") summary.imported += 1;
    if (outcome === "updated") summary.updated += 1;
    if (summary.results.length < 16) {
      summary.results.push({
        title: posting.title,
        employer: posting.companyName,
        url: posting.sourceUrl,
        score: assessment.score,
        outcome,
        belowThreshold: below,
      });
    }
  }
  for (const company of findings.companies) {
    if (summary.companiesAdded >= maxCompanyAdds) break;
    summary.companiesDiscovered += 1;
    if (knownCompanies.some((known) => sameCompany(known, company))) {
      summary.errors.push(`${company.name}: Already monitored, so company research was reused.`);
      continue;
    }
    const verified = await verifyCompany(company, fetchImpl);
    if (!verified.ok) {
      summary.errors.push(`${company.name}: ${verified.reason}`);
      continue;
    }
    if (dryRun || !db) {
      summary.companiesAdded += 1;
      if (verified.board) summary.boardsEnabled += 1;
      else summary.companiesWithoutOpenings += 1;
      continue;
    }
    const added = await saveCompany(db, company, verified);
    if (added.added) summary.companiesAdded += 1;
    if (added.board) summary.boardsEnabled += 1;
    else if (added.added) summary.companiesWithoutOpenings += 1;
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
  if (board.provider === "workday") return workdayResponds(board.boardId, fetchImpl);
  const url = boardProbeUrl(board);
  if (!url) return false;
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "charliewaghmare-jobs/1.0" } });
    if (!response.ok) return false;
    const payload = await response.json();
    if (Array.isArray(payload)) return true;
    if (!payload || typeof payload !== "object") return false;
    const record = payload as { jobs?: unknown; content?: unknown; results?: unknown; totalFound?: unknown };
    return Array.isArray(record.jobs) || Array.isArray(record.content) || Array.isArray(record.results) || typeof record.totalFound === "number";
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

function emptySummary(depth: ResearchDepth | null = null): ResearchSummary {
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
    companiesWithoutOpenings: 0,
    screenedOut: 0,
    boardsEnabled: 0,
    belowThreshold: 0,
    withheld: 0,
    errors: [],
    estimatedUsd: null,
    depth,
    results: [],
    usage: { inputTokens: 0, outputTokens: 0, searchCalls: 0 },
  };
}

async function claimRun(db: SupabaseClient, runId: string): Promise<boolean> {
  const { data, error } = await db
    .from("search_runs")
    .update({ status: "running" })
    .eq("id", runId)
    .eq("status", "requested")
    .select("id");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
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

async function workdayResponds(boardId: string, fetchImpl: typeof fetch): Promise<boolean> {
  const [host, tenant, site] = boardId.split("/");
  if (!host || !tenant || !site) return false;
  try {
    const response = await fetchImpl(`https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "charliewaghmare-jobs/1.0",
      },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "internship" }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { total?: unknown; jobPostings?: unknown };
    return typeof payload.total === "number" || Array.isArray(payload.jobPostings);
  } catch {
    return false;
  }
}

function boardProbeUrl(board: { provider: string; boardId: string }): string | null {
  if (board.provider === "greenhouse") {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs`;
  }
  if (board.provider === "lever") {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json&limit=1`;
  }
  if (board.provider === "ashby") {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}`;
  }
  if (board.provider === "smartrecruiters") {
    return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.boardId)}/postings?limit=1`;
  }
  if (board.provider === "workable") {
    return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board.boardId)}`;
  }
  return null;
}

async function loadCoverageCounts(db: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await db.from("jobs").select("category_tags").eq("active", true).eq("is_sample", false).limit(400);
  const counts: Record<string, number> = {
    mechanical: 0,
    motorsports: 0,
    running: 0,
    materials: 0,
    software: 0,
    finance: 0,
    regional: 0,
  };
  for (const row of data ?? []) {
    const tags = Array.isArray(row.category_tags) ? row.category_tags.map((tag: unknown) => String(tag).toLowerCase()) : [];
    if (tags.some((tag) => tag.includes("mechanical") || tag.includes("product"))) counts.mechanical += 1;
    if (tags.some((tag) => tag.includes("motor"))) counts.motorsports += 1;
    if (tags.some((tag) => tag.includes("running") || tag.includes("wearable") || tag.includes("footwear"))) counts.running += 1;
    if (tags.some((tag) => tag.includes("material") || tag.includes("manufactur"))) counts.materials += 1;
    if (tags.some((tag) => tag.includes("software") || tag.includes("ai"))) counts.software += 1;
    if (tags.some((tag) => tag.includes("finance") || tag.includes("fintech"))) counts.finance += 1;
  }
  return counts;
}

async function loadKnownCompanies(db: SupabaseClient): Promise<{ name: string; website: string | null }[]> {
  const { data } = await db.from("companies").select("name, website").eq("is_sample", false).limit(300);
  return (data ?? []).map((row) => ({ name: String(row.name), website: row.website }));
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

async function recordRun(
  db: SupabaseClient,
  summary: ResearchSummary,
  status: string,
  runId: string | null,
  prompt: string | null,
): Promise<void> {
  const row = {
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
  };
  if (runId) {
    await db.from("search_runs").update(row).eq("id", runId);
    return;
  }
  await db.from("search_runs").insert({
    ...row,
    started_at: new Date().toISOString(),
    prompt,
  });
}
