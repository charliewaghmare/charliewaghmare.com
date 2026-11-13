import type { SupabaseClient } from "@supabase/supabase-js";
import { decideWrite, nextLifecycle } from "@/lib/jobs/collect/dedupe";
import { assessPosting, SCORING_VERSION, type Assessment, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl } from "@/lib/jobs/collect/text";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

export type SourceResult = {
  company: WatchCompany;
  ok: boolean;
  error: string | null;
  postings: CollectedPosting[];
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
  relevant: number;
  belowThreshold: number;
  inserted: number;
  updated: number;
  stale: number;
  closed: number;
  reviewed: number;
  retained: number;
  storedExcluded: number;
  storedQuarantined: number;
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
    relevant: 0,
    belowThreshold: 0,
    inserted: 0,
    updated: 0,
    stale: 0,
    closed: 0,
    reviewed: 0,
    retained: 0,
    storedExcluded: 0,
    storedQuarantined: 0,
    examples: [],
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };

  for (const company of companies) {
    const result = results.find((item) => item.company.name === company.name);
    await upsertCompany(db, company, Boolean(result?.ok));
  }

  for (const result of results) {
    const companyId = await companyIdByName(db, result.company.name);
    if (!companyId || !result.ok) continue;
    const seen = new Set<string>();
    for (const posting of result.postings) {
      const assessment = assessPosting(posting);
      countAssessment(summary, assessment);
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
      if (outcome === "updated") summary.updated += 1;
      if (outcome !== "skipped") seen.add(posting.sourceId);
    }
    const lifecycle = await markMissing(db, result.company, companyId, seen);
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
  if (assessment.status === "uncertain") summary.uncertain += 1;
  else if (assessment.status === "ineligible_professional_role") summary.ineligibleProfessional += 1;
}

async function companyIdByName(db: SupabaseClient, name: string): Promise<string | null> {
  const { data } = await db.from("companies").select("id").eq("name", name).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function upsertCompany(
  db: SupabaseClient,
  company: WatchCompany,
  checked: boolean,
): Promise<string | null> {
  const { data: existing } = await db
    .from("companies")
    .select("id")
    .eq("name", company.name)
    .maybeSingle();
  const row = {
    name: company.name,
    website: company.website,
    careers_url: company.careersUrl,
    industry: company.categories[0] ?? null,
    why_interesting: company.why,
    ats_provider: company.provider,
    ats_board_id: company.boardId,
    enabled: company.enabled,
    ...(checked ? { last_checked_at: new Date().toISOString() } : {}),
    categories: company.categories,
    geographic_relevance: company.geographicRelevance,
    monitoring_status: company.provider && company.boardId ? "active" : "pending",
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

async function upsertJob(
  db: SupabaseClient,
  companyId: string,
  posting: CollectedPosting,
  scored: Assessment,
): Promise<"inserted" | "updated" | "skipped"> {
  const sourceUrl = canonicalUrl(posting.sourceUrl);
  const [{ data: byIdentity }, { data: byUrl }, { data: suppressed }] = await Promise.all([
    db
      .from("jobs")
      .select("id, discovered_at")
      .eq("source", posting.provider)
      .eq("source_id", posting.sourceId)
      .maybeSingle(),
    sourceUrl
      ? db.from("jobs").select("id, discovered_at").eq("source_url", sourceUrl).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("job_suppressions")
      .select("id")
      .eq("source", posting.provider)
      .eq("source_id", posting.sourceId)
      .maybeSingle(),
  ]);
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
    lifecycle_status: decision.keepInactive ? "closed" : "active",
    verification_status: "verified",
    miss_count: 0,
    work_authorization_note: scored.gaps.find((gap) => gap.includes("authorization")) ?? null,
    is_sample: false,
    updated_at: now,
    raw_metadata: metadataFor(posting, scored),
  };
  if (decision.action === "update" && existing?.id) {
    const { error } = await db.from("jobs").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return "updated";
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
  const { data } = await db
    .from("jobs")
    .select("id, source_id, miss_count, active")
    .eq("company_id", companyId)
    .eq("source", company.provider);
  let stale = 0;
  let closed = 0;
  for (const row of data ?? []) {
    if (!row.active || !row.source_id || seen.has(row.source_id)) {
      if (row.active && row.source_id && seen.has(row.source_id)) {
        await db.from("jobs").update({ miss_count: 0, lifecycle_status: "active" }).eq("id", row.id);
      }
      continue;
    }
    const next = nextLifecycle({
      seen: false,
      sourceOk: true,
      missCount: row.miss_count ?? 0,
    });
    await db
      .from("jobs")
      .update({
        miss_count: next.missCount,
        lifecycle_status: next.lifecycle,
        active: next.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
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
    categoryEvidence: assessment.categories.map((category) => ({
      category: category.id,
      evidence: category.evidence,
    })),
  };
}

async function withholdJob(db: SupabaseClient, posting: CollectedPosting, assessment: Assessment): Promise<boolean> {
  const { data } = await db
    .from("jobs")
    .select("id, raw_metadata")
    .eq("source", posting.provider)
    .eq("source_id", posting.sourceId)
    .maybeSingle();
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
  const { data: suppressed } = await db.from("job_suppressions").select("source, source_id");
  const suppressedKeys = new Set(
    (suppressed ?? []).map((row) => `${row.source}:${row.source_id}`),
  );
  let from = 0;
  const page = 200;
  for (;;) {
    const { data, error } = await db
      .from("jobs")
      .select(
        "id, source, source_id, source_url, application_url, title, location, country, work_arrangement, description, employment_type, posted_on, salary_min, salary_max, salary_currency, salary_period, lifecycle_status, raw_metadata, is_sample",
      )
      .eq("is_sample", false)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      counts.reviewed += 1;
      const source = row.source === "lever" || row.source === "ashby" || row.source === "greenhouse" ? row.source : "greenhouse";
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
      });
      const suppressedRow = suppressedKeys.has(`${row.source}:${row.source_id}`);
      const closed = row.lifecycle_status === "closed";
      const publish = assessment.publish && !suppressedRow && !closed;
      if (publish) counts.retained += 1;
      else if (assessment.status === "uncertain") counts.quarantined += 1;
      else if (assessment.status === "ineligible_professional_role") counts.excludedProfessional += 1;
      const prior =
        row.raw_metadata && typeof row.raw_metadata === "object" && !Array.isArray(row.raw_metadata)
          ? (row.raw_metadata as Record<string, unknown>)
          : {};
      const metadata = metadataFor(
        { departments: Array.isArray(prior.departments) ? (prior.departments as string[]) : [] } as CollectedPosting,
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
  const { data } = await db.from("companies").select("id").eq("is_sample", false);
  for (const company of data ?? []) {
    const { count } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("active", true);
    await db.from("companies").update({ has_verified_opening: (count ?? 0) > 0 }).eq("id", company.id);
  }
}

function workTerm(posting: CollectedPosting): string {
  const text = `${posting.title} ${posting.description}`.toLowerCase();
  const match = text.match(/\b(summer|fall|winter|spring)\s+(20\d{2})\b/);
  if (match) return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}`;
  if (/rolling|flexible start/.test(text)) return "Rolling or flexible start";
  return "Term not listed";
}
