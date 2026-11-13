import type { SupabaseClient } from "@supabase/supabase-js";
import { decideWrite, keepEmployerRecord, nextLifecycle } from "@/lib/jobs/collect/dedupe";
import { assessPosting, SCORING_VERSION, type Assessment, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl } from "@/lib/jobs/collect/text";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

export type SourceResult = {
  company: WatchCompany;
  ok: boolean;
  error: string | null;
  postings: CollectedPosting[];
  /** Only complete employer snapshots can establish that a posting disappeared. */
  complete?: boolean;
};

export type SourceTally = {
  name: string;
  provider: string;
  fetched: number;
  eligible: number;
  ineligible: number;
  uncertain: number;
  withheldEligible: number;
  aboveThreshold: number;
  belowThreshold: number;
};

export type RunSummary = {
  sourcesChecked: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  fetched: number;
  excluded: number;
  eligibleStudent: number;
  ineligibleProfessional: number;
  uncertain: number;
  withheldEligible: number;
  relevant: number;
  belowThreshold: number;
  inserted: number;
  updated: number;
  duplicates: number;
  suppressed: number;
  stale: number;
  closed: number;
  reviewed: number;
  retained: number;
  storedExcluded: number;
  storedQuarantined: number;
  feedRaw: number;
  feedClosed: number;
  feedRejectedLink: number;
  feedDuplicateBoard: number;
  bySource: SourceTally[];
  examples: string[];
  errors: string[];
};

export async function persistCollection(
  db: SupabaseClient,
  results: SourceResult[],
  companies: WatchCompany[] = results.map((result) => result.company),
): Promise<RunSummary> {
  const summary: RunSummary = {
    sourcesChecked: results.length,
    sourcesSucceeded: results.filter((result) => result.ok).length,
    sourcesFailed: results.filter((result) => result.error).length,
    fetched: results.reduce((sum, result) => sum + result.postings.length, 0),
    excluded: 0,
    eligibleStudent: 0,
    ineligibleProfessional: 0,
    uncertain: 0,
    withheldEligible: 0,
    relevant: 0,
    belowThreshold: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    suppressed: 0,
    stale: 0,
    closed: 0,
    reviewed: 0,
    retained: 0,
    storedExcluded: 0,
    storedQuarantined: 0,
    feedRaw: 0,
    feedClosed: 0,
    feedRejectedLink: 0,
    feedDuplicateBoard: 0,
    bySource: [],
    examples: [],
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };

  const { data: customScopes, error: scopeError } = await db.from("jobs")
    .select("source, source_id, source_url").eq("raw_metadata->>allowInternational", "true");
  if (scopeError) throw new Error(`Could not load custom search scope: ${scopeError.message}`);
  const internationalKeys = new Set((customScopes ?? []).map((row) => `${row.source}:${row.source_id}`));
  const internationalUrls = new Set((customScopes ?? []).map((row) => row.source_url).filter(Boolean));
  const companyIds = new Map<string, string>();
  for (const company of companies) {
    const result = results.find((item) => item.company.name === company.name);
    const id = await upsertCompany(db, company, Boolean(result?.ok));
    if (id) companyIds.set(company.name, id);
  }

  for (const result of results) {
    const companyId = companyIds.get(result.company.name) ?? await upsertCompany(db, result.company, result.ok);
    if (!companyId || !result.ok) continue;
    const seen = new Set<string>();
    const tally = emptyTally(result.company.name, result.company.provider ?? "unknown");
    tally.fetched = result.postings.length;
    for (const incoming of result.postings) {
      const posting = internationalKeys.has(`${incoming.provider}:${incoming.sourceId}`) || internationalUrls.has(canonicalUrl(incoming.sourceUrl))
        ? { ...incoming, allowInternational: true } : incoming;
      const assessment = assessPosting(posting);
      countAssessment(summary, assessment);
      noteTally(tally, assessment);
      if (!assessment.publish) {
        const withheld = await withholdJob(db, posting, assessment);
        if (withheld) summary.updated += 1;
        if (summary.examples.length < 12) {
          summary.examples.push(`${assessment.status}: ${posting.companyName} — ${posting.title}. ${assessment.reason}`);
        }
        continue;
      }
      const outcome = await upsertJob(db, companyId, posting, assessment);
      if (outcome === "inserted") summary.inserted += 1;
      if (outcome === "duplicate") summary.duplicates += 1;
      if (outcome === "skipped") summary.suppressed += 1;
      if (outcome === "updated" || outcome === "duplicate") summary.updated += 1;
      if (outcome !== "skipped") seen.add(posting.sourceId);
    }
    summary.bySource.push(tally);
    const lifecycle = result.complete === true && result.company.provider
      ? await markMissing(db, result.company, companyId, seen)
      : { stale: 0, closed: 0 };
    summary.stale += lifecycle.stale;
    summary.closed += lifecycle.closed;
  }

  const reviewed = await reclassifyStoredJobs(db);
  summary.reviewed = reviewed.reviewed;
  summary.retained = reviewed.retained;
  summary.storedExcluded = reviewed.excludedProfessional;
  summary.storedQuarantined = reviewed.quarantined;
  await refreshOpeningFlags(db);
  return summary;
}

function countAssessment(summary: RunSummary, assessment: Assessment): void {
  if (assessment.publish) {
    summary.eligibleStudent += 1;
    if (assessment.score >= 50) summary.relevant += 1;
    else summary.belowThreshold += 1;
    return;
  }
  summary.excluded += 1;
  if (assessment.status === "eligible_student_role") summary.withheldEligible += 1;
  else if (assessment.status === "uncertain") summary.uncertain += 1;
  else if (assessment.status === "ineligible_professional_role") summary.ineligibleProfessional += 1;
}

function emptyTally(name: string, provider: string): SourceTally {
  return {
    name,
    provider,
    fetched: 0,
    eligible: 0,
    ineligible: 0,
    uncertain: 0,
    withheldEligible: 0,
    aboveThreshold: 0,
    belowThreshold: 0,
  };
}

function noteTally(tally: SourceTally, assessment: Assessment): void {
  if (assessment.publish) {
    tally.eligible += 1;
    if (assessment.score >= 50) tally.aboveThreshold += 1;
    else tally.belowThreshold += 1;
    return;
  }
  if (assessment.status === "eligible_student_role") tally.withheldEligible += 1;
  else if (assessment.status === "uncertain") tally.uncertain += 1;
  else if (assessment.status === "ineligible_professional_role") tally.ineligible += 1;
}

async function upsertCompany(
  db: SupabaseClient,
  company: WatchCompany,
  checked: boolean,
): Promise<string | null> {
  const { data: existing, error: lookupError } = await db
    .from("companies")
    .select("id, website, careers_url, ats_provider, ats_board_id, enabled, categories")
    .eq("name", company.name)
    .maybeSingle();
  if (lookupError) throw new Error(`Company lookup failed: ${lookupError.message}`);
  const row = {
    name: company.name,
    website: company.website ?? existing?.website,
    careers_url: company.careersUrl ?? existing?.careers_url,
    industry: company.categories[0] ?? null,
    why_interesting: company.why,
    ats_provider: company.provider ?? existing?.ats_provider,
    ats_board_id: company.boardId ?? existing?.ats_board_id,
    enabled: existing?.enabled ?? company.enabled,
    ...(checked ? { last_checked_at: new Date().toISOString() } : {}),
    categories: company.categories.length ? company.categories : existing?.categories ?? [],
    geographic_relevance: company.geographicRelevance,
    monitoring_status: (company.provider ?? existing?.ats_provider) && (company.boardId ?? existing?.ats_board_id) ? "active" : "pending",
    is_sample: false,
    discovery_status: "watching",
  };
  if (existing?.id) {
    const { error } = await db.from("companies").update(row).eq("id", existing.id);
    if (error) throw new Error(`Could not update ${company.name}: ${error.message}`);
    return existing.id as string;
  }
  const { data, error } = await db.from("companies").insert(row).select("id").single();
  if (error || !data) throw new Error(`Could not add ${company.name}: ${error?.message ?? "no row"}`);
  return data.id as string;
}

export async function upsertJob(
  db: SupabaseClient,
  companyId: string,
  posting: CollectedPosting,
  scored: Assessment,
): Promise<"inserted" | "updated" | "duplicate" | "skipped"> {
  const sourceUrl = canonicalUrl(posting.sourceUrl);
  const lookups = await Promise.all([
    db
      .from("jobs")
      .select("id, discovered_at, source, company_id")
      .eq("source", posting.provider)
      .eq("source_id", posting.sourceId)
      .maybeSingle(),
    sourceUrl
      ? db.from("jobs").select("id, discovered_at, source, company_id").eq("source_url", sourceUrl).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("job_suppressions")
      .select("id")
      .eq("source", posting.provider)
      .eq("source_id", posting.sourceId)
      .maybeSingle(),
    sourceUrl
      ? db.from("job_suppressions").select("id").eq("source_url", sourceUrl).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of lookups) {
    if (result.error) throw new Error(`Job identity lookup failed: ${result.error.message}`);
  }
  const [identityResult, urlResult, suppressionResult, urlSuppressionResult] = lookups;
  const byIdentity = identityResult.data;
  const byUrl = urlResult.data;
  if (byIdentity && byIdentity.company_id !== companyId) {
    throw new Error(`Source identity collision for ${posting.provider}:${posting.sourceId}; refusing to overwrite another employer.`);
  }
  if (byIdentity && byUrl && byIdentity.id !== byUrl.id) throw new Error("Conflicting job identities require review; no records were merged.");
  const suppressed = suppressionResult.data || urlSuppressionResult.data;
  const decision = decideWrite({
    existingByIdentity: Boolean(byIdentity),
    existingByUrl: Boolean(byUrl),
    suppressed: Boolean(suppressed),
  });
  if (decision.action === "skip") return "skipped";
  const now = new Date().toISOString();
  const existing = byIdentity ?? byUrl;
  const row = {
    source: posting.provider,
    source_id: posting.sourceId,
    source_url: sourceUrl,
    application_url: canonicalUrl(posting.applicationUrl),
    title: posting.title,
    company_id: companyId,
    location: posting.location,
    country: posting.country,
    work_arrangement: posting.workArrangement,
    description: posting.description.slice(0, 20000),
    employment_type: posting.employmentType,
    work_term: workTerm(posting),
    posted_on: posting.postedOn,
    last_verified_at: now,
    match_score: scored.score,
    score_breakdown: scored.breakdown,
    scoring_version: SCORING_VERSION,
    recommendation: scored.explanation,
    skill_gaps: scored.gaps,
    category_tags: scored.tags,
    salary_min: posting.salaryMin,
    salary_max: posting.salaryMax,
    salary_currency: posting.salaryCurrency,
    salary_period: posting.salaryPeriod,
    active: !decision.keepInactive,
    lifecycle_status: "active",
    verification_status: "verified",
    miss_count: 0,
    work_authorization_note: scored.gaps.find((gap) => gap.includes("authorization")) ?? null,
    is_sample: false,
    updated_at: now,
    raw_metadata: metadataFor(posting, scored),
  };
  if (decision.action === "update" && existing?.id && keepEmployerRecord(existing.source as string | null, posting.provider)) {
    return "duplicate";
  }
  if (decision.action === "update" && existing?.id) {
    const { error } = await db.from("jobs").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return byIdentity ? "updated" : "duplicate";
  }
  const { error } = await db.from("jobs").insert({ ...row, discovered_at: now });
  if (error) throw new Error(error.message);
  return "inserted";
}

async function markMissing(
  db: SupabaseClient,
  company: WatchCompany,
  companyId: string,
  seen: Set<string>,
): Promise<{ stale: number; closed: number }> {
  const { data, error } = await db
    .from("jobs")
    .select("id, source_id, miss_count, active")
    .eq("company_id", companyId)
    .eq("source", company.listingSource ?? company.provider);
  if (error) throw new Error(`Lifecycle lookup failed: ${error.message}`);
  let stale = 0;
  let closed = 0;
  for (const row of data ?? []) {
    if (!row.active || !row.source_id || seen.has(row.source_id)) {
      if (row.active && row.source_id && seen.has(row.source_id)) {
        const { error: updateError } = await db.from("jobs").update({ miss_count: 0, lifecycle_status: "active" }).eq("id", row.id);
        if (updateError) throw new Error(`Lifecycle update failed: ${updateError.message}`);
      }
      continue;
    }
    const next = nextLifecycle({
      seen: false,
      sourceOk: true,
      missCount: row.miss_count ?? 0,
    });
    const { error: updateError } = await db
      .from("jobs")
      .update({
        miss_count: next.missCount,
        lifecycle_status: next.lifecycle,
        active: next.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw new Error(`Lifecycle update failed: ${updateError.message}`);
    if (next.lifecycle === "stale") stale += 1;
    if (next.lifecycle === "closed") closed += 1;
  }
  return { stale, closed };
}

function metadataFor(posting: CollectedPosting, assessment: Assessment): Record<string, unknown> {
  return {
    departments: posting.departments,
    eligibility: assessment.status,
    eligibilityReason: assessment.reason,
    classificationVersion: SCORING_VERSION,
    provenance: posting.provenance ?? (posting.provider === "web" ? "web-research" : "employer-api"),
    allowInternational: posting.allowInternational === true,
    categoryEvidence: assessment.categories.map((category) => ({
      category: category.id,
      evidence: category.evidence,
    })),
  };
}

async function withholdJob(db: SupabaseClient, posting: CollectedPosting, assessment: Assessment): Promise<boolean> {
  const { data, error: lookupError } = await db
    .from("jobs")
    .select("id, raw_metadata")
    .eq("source", posting.provider)
    .eq("source_id", posting.sourceId)
    .maybeSingle();
  if (lookupError) throw new Error(`Job lookup failed: ${lookupError.message}`);
  if (!data?.id) return false;
  const prior = data.raw_metadata && typeof data.raw_metadata === "object" ? data.raw_metadata : {};
  const { error } = await db
    .from("jobs")
    .update({
      active: false,
      scoring_version: SCORING_VERSION,
      recommendation: assessment.reason,
      category_tags: assessment.tags,
      raw_metadata: { ...prior, ...metadataFor(posting, assessment) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);
  if (error) throw new Error(error.message);
  return true;
}

export async function reclassifyStoredJobs(db: SupabaseClient): Promise<{
  reviewed: number;
  retained: number;
  excludedProfessional: number;
  quarantined: number;
}> {
  const counts = { reviewed: 0, retained: 0, excludedProfessional: 0, quarantined: 0 };
  const { data: suppressed, error: suppressionError } = await db.from("job_suppressions").select("source, source_id, source_url");
  if (suppressionError) throw new Error(`Suppression lookup failed: ${suppressionError.message}`);
  const suppressedKeys = new Set(
    (suppressed ?? []).map((row) => `${row.source}:${row.source_id}`),
  );
  const suppressedUrls = new Set((suppressed ?? []).map((row) => row.source_url).filter(Boolean));
  let from = 0;
  const page = 200;
  for (;;) {
    const { data, error } = await db
      .from("jobs")
      .select(
        "id, source, source_id, source_url, application_url, title, location, country, work_arrangement, description, employment_type, posted_on, salary_min, salary_max, salary_currency, salary_period, lifecycle_status, raw_metadata, is_sample, active, match_score, scoring_version",
      )
      .eq("is_sample", false)
      .order("id")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      counts.reviewed += 1;
      const source =
        row.source === "lever" ||
        row.source === "ashby" ||
        row.source === "greenhouse" ||
        row.source === "smartrecruiters" ||
        row.source === "workable" ||
        row.source === "workday" ||
        row.source === "web"
          ? row.source
          : "web";
      const metadataBefore = row.raw_metadata as Record<string, unknown> | null;
      const assessment = assessPosting({
        provider: source,
        sourceId: row.source_id ?? row.id,
        title: row.title,
        companyName: "",
        location: row.location,
        country: row.country,
        workArrangement: row.work_arrangement,
        description: row.description ?? "",
        departments: [],
        sourceUrl: row.source_url,
        applicationUrl: row.application_url,
        postedOn: row.posted_on,
        employmentType: row.employment_type,
        salaryMin: row.salary_min,
        salaryMax: row.salary_max,
        salaryCurrency: row.salary_currency,
        salaryPeriod: row.salary_period,
        allowInternational: metadataBefore?.allowInternational === true,
      });
      const suppressedRow = suppressedKeys.has(`${row.source}:${row.source_id}`) || suppressedUrls.has(row.source_url);
      const closed = row.lifecycle_status === "closed";
      const publish = assessment.publish && !suppressedRow && !closed;
      if (publish) counts.retained += 1;
      else if (assessment.status === "uncertain") counts.quarantined += 1;
      else if (assessment.status === "ineligible_professional_role") counts.excludedProfessional += 1;
      const prior =
        row.raw_metadata && typeof row.raw_metadata === "object" && !Array.isArray(row.raw_metadata)
          ? (row.raw_metadata as Record<string, unknown>)
          : {};
      if (row.scoring_version === SCORING_VERSION && row.active === publish &&
          row.match_score === (publish ? assessment.score : 0) && prior.eligibilityReason === assessment.reason) continue;
      const metadata = metadataFor(
        { departments: Array.isArray(prior.departments) ? (prior.departments as string[]) : [],
          provider: source, provenance: prior.provenance, allowInternational: prior.allowInternational === true } as CollectedPosting,
        assessment,
      );
      const { error: updateError } = await db
        .from("jobs")
        .update({
          active: publish,
          match_score: publish ? assessment.score : 0,
          score_breakdown: assessment.breakdown,
          scoring_version: SCORING_VERSION,
          recommendation: publish ? assessment.explanation : assessment.reason,
          skill_gaps: assessment.gaps,
          category_tags: assessment.tags,
          work_authorization_note: assessment.gaps.find((gap) => gap.includes("authorization")) ?? null,
          raw_metadata: { ...prior, ...metadata, departments: prior.departments ?? metadata.departments },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
    }
    if (data.length < page) break;
    from += page;
  }
  return counts;
}

async function refreshOpeningFlags(db: SupabaseClient): Promise<void> {
  const { data: companies, error } = await db.from("companies")
    .select("id, has_verified_opening").eq("is_sample", false);
  if (error) throw new Error(`Could not load company flags: ${error.message}`);
  const activeCompanies = new Set<string>();
  for (let offset = 0;; offset += 200) {
    const { data, error: jobsError } = await db.from("jobs").select("id, company_id")
      .eq("active", true).eq("is_sample", false).order("id").range(offset, offset + 199);
    if (jobsError) throw new Error(`Could not refresh company flags: ${jobsError.message}`);
    for (const job of data ?? []) activeCompanies.add(job.company_id);
    if (!data || data.length < 200) break;
  }
  for (const company of companies ?? []) {
    const hasOpening = activeCompanies.has(company.id);
    if (company.has_verified_opening === hasOpening) continue;
    const { error: updateError } = await db.from("companies")
      .update({ has_verified_opening: hasOpening }).eq("id", company.id);
    if (updateError) throw new Error(`Could not update company flag: ${updateError.message}`);
  }
}

function workTerm(posting: CollectedPosting): string {
  const text = `${posting.title} ${posting.description}`.toLowerCase();
  const match = text.match(/\b(summer|fall|winter|spring)\s+(20\d{2})\b/);
  if (match) return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}`;
  if (/rolling|flexible start/.test(text)) return "Rolling or flexible start";
  return "Term not listed";
}
