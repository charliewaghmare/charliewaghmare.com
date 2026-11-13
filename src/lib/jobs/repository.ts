import type { SupabaseClient } from "@supabase/supabase-js";
import { sampleCompanies, sampleJobs } from "@/lib/jobs/demo";
import { defaultSearchPreferences, isSearchPreferences } from "@/lib/jobs/profile";
import { anonClient, databaseConfigured, pinConfigured, serviceClient } from "@/lib/jobs/supabase";
import type {
  ApplicationStage,
  CompanyTarget,
  IgnoredJob,
  JobListing,
  JobsPageModel,
  ScoreBreakdown,
  SearchPreferences,
  StoredSearch,
  WorkArrangement,
} from "@/lib/jobs/types";

type JobRow = {
  id: string;
  source: string;
  source_id: string | null;
  source_url: string | null;
  application_url: string | null;
  title: string;
  company_id: string;
  location: string | null;
  work_arrangement: WorkArrangement | null;
  description: string | null;
  responsibilities: string[] | null;
  qualifications: string[] | null;
  skills: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  work_term: string | null;
  posted_on: string | null;
  discovered_at: string;
  last_verified_at: string | null;
  match_score: number;
  score_breakdown: ScoreBreakdown | null;
  recommendation: string | null;
  skill_gaps: string[] | null;
  deadline: string | null;
  category_tags: string[] | null;
  active: boolean;
  is_sample: boolean;
  lifecycle_status?: "active" | "stale" | "closed" | null;
  country?: string | null;
  scoring_version?: string | null;
  work_authorization_note?: string | null;
  companies:
    | { id: string; name: string; logo_url: string | null }
    | { id: string; name: string; logo_url: string | null }[]
    | null;
};

type StatusRow = {
  job_id: string;
  saved: boolean;
  applied: boolean;
  applied_on: string | null;
  notes: string | null;
  stage: ApplicationStage | null;
};

const jobColumns =
  "id, source, source_id, source_url, application_url, title, company_id, location, work_arrangement, description, responsibilities, qualifications, skills, salary_min, salary_max, salary_currency, salary_period, employment_type, work_term, posted_on, discovered_at, last_verified_at, match_score, score_breakdown, recommendation, skill_gaps, deadline, category_tags, active, is_sample, companies(id, name, logo_url)";

export async function getJobsPageModel(unlocked: boolean): Promise<JobsPageModel> {
  const base: JobsPageModel = {
    source: "sample",
    note: "Sample listings for layout preview. They are fictional and not open.",
    jobs: sampleJobs,
    companies: sampleCompanies,
    preferences: unlocked ? defaultSearchPreferences : null,
    ignored: [],
    customSearches: [],
    lastSuccessfulRefresh: null,
    collection: null,
    research: null,
    databaseConfigured: databaseConfigured(),
    pinConfigured: pinConfigured(),
  };

  const reader = anonClient() ?? serviceClient();
  if (!reader) return base;

  const listed = await reader
    .from("jobs")
    .select(`${jobColumns}, lifecycle_status, country, scoring_version, work_authorization_note`)
    .eq("active", true)
    .eq("is_sample", false)
    .order("match_score", { ascending: false });
  const fallback = listed.error
    ? await reader.from("jobs").select(jobColumns).eq("active", true).order("match_score", { ascending: false })
    : listed;

  if (fallback.error || !fallback.data) {
    return {
      ...emptyDatabase("The jobs database did not respond."),
      databaseConfigured: databaseConfigured(),
      pinConfigured: pinConfigured(),
      preferences: unlocked ? defaultSearchPreferences : null,
    };
  }

  const rows = (fallback.data as JobRow[]).filter((row) => row.is_sample !== true);
  const companies = await loadCompanies(reader);
  const collection = await loadRunStatus("collection");
  const research = await loadRunStatus("research");
  if (rows.length === 0) {
    return {
      ...emptyDatabase(
        "No current student roles are in the feed. Professional postings stay out of discovery.",
      ),
      companies,
      collection,
      research,
      lastSuccessfulRefresh: collection?.status === "success" ? collection.completedAt : null,
      databaseConfigured: databaseConfigured(),
      pinConfigured: pinConfigured(),
      preferences: unlocked ? defaultSearchPreferences : null,
    };
  }

  const statusById = new Map<string, StatusRow>();
  const historyJobs: JobListing[] = [];
  let preferences: SearchPreferences | null = null;
  let ignored: IgnoredJob[] = [];
  let customSearches: StoredSearch[] = [];
  let lastSuccessfulRefresh: string | null = null;

  const service = serviceClient();
  if (unlocked && service) {
    const ids = rows.map((row) => row.id);
    const [statusResult, preferenceResult, ignoredResult, searchResult, refreshResult] =
      await Promise.all([
        service.from("user_job_status").select("*").in("job_id", ids),
        service.from("search_preferences").select("*").eq("id", 1).maybeSingle(),
        service
          .from("job_suppressions")
          .select("id, job_id, source, source_id, suppressed_at, jobs(title, companies(name))")
          .order("suppressed_at", { ascending: false })
          .limit(20),
        service
          .from("search_runs")
          .select("id, prompt, started_at, status")
          .eq("run_type", "custom_search")
          .order("started_at", { ascending: false })
          .limit(8),
        service
          .from("search_runs")
          .select("completed_at")
          .eq("run_type", "collection")
          .in("status", ["success", "partial"])
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    for (const row of (statusResult.data ?? []) as StatusRow[]) {
      statusById.set(row.job_id, row);
    }
    const historyResult = await service
      .from("user_job_status")
      .select("*")
      .or("saved.eq.true,applied.eq.true");
    const missing = ((historyResult.data ?? []) as StatusRow[]).filter((row) => !ids.includes(row.job_id));
    if (missing.length > 0) {
      const extraResult = await service.from("jobs").select(jobColumns).in(
        "id",
        missing.map((row) => row.job_id),
      );
      for (const row of (extraResult.data ?? []) as JobRow[]) {
        const status = missing.find((item) => item.job_id === row.id) ?? null;
        historyJobs.push({ ...toJob(row, status, true), inDiscovery: false });
      }
    }
    preferences = preferencesFromRow(preferenceResult.data) ?? defaultSearchPreferences;
    ignored = mapIgnored(ignoredResult.data ?? []);
    customSearches = ((searchResult.data ?? []) as {
      id: string;
      prompt: string | null;
      started_at: string;
      status: string;
    }[])
      .filter((row) => row.prompt)
      .map((row) => ({
        id: row.id,
        prompt: row.prompt ?? "",
        createdAt: row.started_at,
        status: row.status,
      }));
    lastSuccessfulRefresh =
      (refreshResult.data as { completed_at: string | null } | null)?.completed_at ?? null;
  } else if (service) {
    const refreshResult = await service
      .from("search_runs")
      .select("completed_at")
      .eq("run_type", "collection")
      .in("status", ["success", "partial"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastSuccessfulRefresh =
      (refreshResult.data as { completed_at: string | null } | null)?.completed_at ?? null;
  }

  return {
    source: "database",
    note: null,
    jobs: [
      ...rows.map((row) => ({ ...toJob(row, statusById.get(row.id) ?? null, unlocked), inDiscovery: true })),
      ...historyJobs,
    ],
    companies,
    preferences,
    ignored,
    customSearches,
    lastSuccessfulRefresh: lastSuccessfulRefresh ?? (collection?.status === "success" ? collection.completedAt : null),
    collection,
    research,
    databaseConfigured: true,
    pinConfigured: pinConfigured(),
  };
}

function emptyDatabase(note: string): JobsPageModel {
  return {
    source: "database",
    note,
    jobs: [],
    companies: [],
    preferences: null,
    ignored: [],
    customSearches: [],
    lastSuccessfulRefresh: null,
    collection: null,
    research: null,
    databaseConfigured: true,
    pinConfigured: false,
  };
}

async function loadCompanies(reader: SupabaseClient): Promise<CompanyTarget[]> {
  const extended = await reader
    .from("companies")
    .select(
      "id, name, industry, location, website, careers_url, logo_url, why_interesting, has_verified_opening, is_sample, monitoring_status, last_checked_at, ats_provider",
    )
    .eq("is_sample", false)
    .order("name");
  const fallback = extended.error
    ? await reader
        .from("companies")
        .select(
          "id, name, industry, location, website, careers_url, logo_url, why_interesting, has_verified_opening, is_sample",
        )
        .order("name")
    : extended;
  return ((fallback.data ?? []) as CompanyRow[]).filter((row) => row.is_sample !== true).map(toCompany);
}

async function loadRunStatus(runType: "collection" | "research"): Promise<JobsPageModel["collection"]> {
  const service = serviceClient();
  if (!service) return null;
  const { data } = await service
    .from("search_runs")
    .select("status, started_at, completed_at, error, summary, run_type")
    .eq("run_type", runType)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const summary = data.summary as {
    inserted?: number;
    updated?: number;
    imported?: number;
    eligible?: number;
    companiesAdded?: number;
    estimatedUsd?: number | null;
    errors?: string[];
  } | null;
  const detail = data.error
    ? String(data.error)
    : runType === "research" && summary
      ? `${summary.imported ?? 0} imported, ${summary.eligible ?? 0} eligible, ${summary.companiesAdded ?? 0} companies${summary.estimatedUsd != null ? `, about $${summary.estimatedUsd}` : ""}`
      : summary
        ? `${summary.inserted ?? 0} new, ${summary.updated ?? 0} updated`
        : null;
  return {
    status: data.status as string,
    startedAt: data.started_at as string,
    completedAt: (data.completed_at as string | null) ?? null,
    detail,
  };
}

type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  website: string | null;
  careers_url: string | null;
  logo_url: string | null;
  why_interesting: string | null;
  has_verified_opening: boolean;
  is_sample: boolean;
  monitoring_status?: string | null;
  last_checked_at?: string | null;
  ats_provider?: string | null;
};

function toCompany(row: CompanyRow): CompanyTarget {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? "Unspecified",
    location: row.location ?? "Unspecified",
    website: row.website,
    careersUrl: row.careers_url,
    logoUrl: row.logo_url,
    why: row.why_interesting ?? "Saved as a company to watch. No opening is verified.",
    hasVerifiedOpening: row.has_verified_opening,
    isSample: row.is_sample,
    monitoringStatus: row.monitoring_status ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    atsProvider: row.ats_provider ?? null,
  };
}

function toJob(row: JobRow, status: StatusRow | null, unlocked: boolean): JobListing {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const breakdown = row.score_breakdown ?? {
    interest: 0,
    location: 0,
    qualifications: 0,
    career: 0,
    compensation: 0,
  };
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    applicationUrl: row.application_url,
    title: row.title,
    companyId: row.company_id,
    companyName: company?.name ?? "Unknown company",
    companyLogoUrl: company?.logo_url ?? null,
    location: row.location ?? "Location not listed",
    workArrangement: row.work_arrangement ?? "onsite",
    description: row.description ?? "",
    responsibilities: asStrings(row.responsibilities),
    qualifications: asStrings(row.qualifications),
    skills: row.skills ?? [],
    salaryLabel: salaryLabel(row),
    employmentType: row.employment_type ?? "Internship",
    workTerm: row.work_term ?? "Term not listed",
    postedOn: row.posted_on,
    discoveredOn: row.discovered_at.slice(0, 10),
    lastVerifiedOn: row.last_verified_at ? row.last_verified_at.slice(0, 10) : null,
    matchScore: row.match_score,
    scoreBreakdown: breakdown,
    recommendation: row.recommendation ?? "",
    skillGaps: row.skill_gaps ?? [],
    deadline: row.deadline,
    tags: row.category_tags ?? [],
    isSample: row.is_sample,
    persisted: true,
    saved: unlocked ? Boolean(status?.saved) : false,
    applied: unlocked ? Boolean(status?.applied) : false,
    appliedOn: unlocked ? status?.applied_on ?? null : null,
    stage: unlocked ? status?.stage ?? null : null,
    notes: unlocked ? status?.notes ?? null : null,
    lifecycleStatus: row.lifecycle_status ?? "active",
    country: row.country ?? null,
    scoringVersion: row.scoring_version ?? null,
    authorizationNote: row.work_authorization_note ?? null,
  };
}

function salaryLabel(row: JobRow): string | null {
  if (row.salary_min === null && row.salary_max === null) return null;
  const currency = row.salary_currency ?? "CAD";
  const period = row.salary_period ? ` / ${row.salary_period}` : "";
  if (row.salary_min !== null && row.salary_max !== null && row.salary_min !== row.salary_max) {
    return `${currency} ${row.salary_min}–${row.salary_max}${period}`;
  }
  const amount = row.salary_min ?? row.salary_max;
  return `${currency} ${amount}${period}`;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function preferencesFromRow(row: unknown): SearchPreferences | null {
  if (!row || typeof row !== "object") return null;
  const record = row as {
    weights?: unknown;
    interests?: unknown;
    locations?: unknown;
    work_terms?: string[];
    min_score?: number;
    strategy?: string;
    feedback_adaptation?: string;
  };
  const candidate = {
    ...defaultSearchPreferences,
    weights: record.weights ?? defaultSearchPreferences.weights,
    interests: record.interests ?? defaultSearchPreferences.interests,
    locations: record.locations ?? defaultSearchPreferences.locations,
    workTerms: record.work_terms ?? defaultSearchPreferences.workTerms,
    minScore: record.min_score ?? defaultSearchPreferences.minScore,
    strategy: record.strategy ?? defaultSearchPreferences.strategy,
    feedbackAdaptation: record.feedback_adaptation ?? defaultSearchPreferences.feedbackAdaptation,
  };
  return isSearchPreferences(candidate) ? candidate : defaultSearchPreferences;
}

function mapIgnored(rows: unknown[]): IgnoredJob[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as {
      id: string;
      job_id: string | null;
      source: string;
      source_id: string | null;
      suppressed_at: string;
      jobs?: { title?: string; companies?: { name?: string } | { name?: string }[] | null } | null;
    };
    const job = record.jobs;
    const company = Array.isArray(job?.companies) ? job?.companies[0] : job?.companies;
    return [
      {
        id: record.id,
        jobId: record.job_id,
        title: job?.title ?? "Ignored listing",
        companyName: company?.name ?? "Unknown company",
        source: record.source,
        sourceId: record.source_id,
        suppressedAt: record.suppressed_at,
      },
    ];
  });
}

export async function countRecentPinFailures(sinceIso: string, ipHash: string): Promise<{
  ipFailures: number;
  globalFailures: number;
} | null> {
  const service = serviceClient();
  if (!service) return null;
  const [ipResult, globalResult] = await Promise.all([
    service
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .eq("ip_hash", ipHash)
      .gte("attempted_at", sinceIso),
    service
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("attempted_at", sinceIso),
  ]);
  if (ipResult.error || globalResult.error) return null;
  return {
    ipFailures: ipResult.count ?? 0,
    globalFailures: globalResult.count ?? 0,
  };
}

export async function recordPinAttempt(success: boolean, ipHash: string): Promise<boolean> {
  const service = serviceClient();
  if (!service) return false;
  const { error } = await service.from("pin_attempts").insert({ success, ip_hash: ipHash });
  return !error;
}

export async function writeJobStatus(input: {
  jobId: string;
  saved?: boolean;
  applied?: boolean;
  stage?: ApplicationStage | null;
  notes?: string | null;
  appliedOn?: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const service = serviceClient();
  if (!service) return { ok: false, status: 503, message: "Database is not configured." };
  const { data: job, error: jobError } = await service
    .from("jobs")
    .select("id, active")
    .eq("id", input.jobId)
    .maybeSingle();
  if (jobError || !job || !job.active) {
    return { ok: false, status: 404, message: "That listing is not in the active feed." };
  }

  const { data: existing } = await service
    .from("user_job_status")
    .select("*")
    .eq("job_id", input.jobId)
    .maybeSingle();
  const current = (existing ?? {}) as Partial<StatusRow>;
  const applied = input.applied ?? current.applied ?? false;
  const next = {
    job_id: input.jobId,
    saved: input.saved ?? current.saved ?? false,
    applied,
    applied_on: applied ? input.appliedOn ?? current.applied_on ?? today() : null,
    notes: input.notes === undefined ? current.notes ?? null : input.notes,
    stage: applied ? input.stage ?? current.stage ?? "applied" : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await service.from("user_job_status").upsert(next);
  if (error) return { ok: false, status: 500, message: "Could not save that change." };
  return { ok: true };
}

export async function ignoreJob(
  jobId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const service = serviceClient();
  if (!service) return { ok: false, status: 503, message: "Database is not configured." };
  const { data: job, error } = await service
    .from("jobs")
    .select("id, source, source_id, source_url, active")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, status: 404, message: "Listing not found." };

  const { error: suppressionError } = await service.from("job_suppressions").insert({
    job_id: job.id,
    source: job.source,
    source_id: job.source_id,
    source_url: job.source_url,
  });
  if (suppressionError) {
    return { ok: false, status: 500, message: "Could not record the suppression." };
  }
  const { error: updateError } = await service
    .from("jobs")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (updateError) return { ok: false, status: 500, message: "Could not hide the listing." };
  return { ok: true };
}

export async function undoIgnore(
  suppressionId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const service = serviceClient();
  if (!service) return { ok: false, status: 503, message: "Database is not configured." };
  const { data, error } = await service
    .from("job_suppressions")
    .select("id, job_id")
    .eq("id", suppressionId)
    .maybeSingle();
  if (error || !data) return { ok: false, status: 404, message: "Ignored listing not found." };
  if (data.job_id) {
    await service
      .from("jobs")
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq("id", data.job_id);
  }
  const { error: deleteError } = await service.from("job_suppressions").delete().eq("id", suppressionId);
  if (deleteError) return { ok: false, status: 500, message: "Could not restore the listing." };
  return { ok: true };
}

export async function savePreferences(
  preferences: SearchPreferences,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const service = serviceClient();
  if (!service) return { ok: false, status: 503, message: "Database is not configured." };
  const { error } = await service.from("search_preferences").upsert({
    id: 1,
    weights: preferences.weights,
    interests: preferences.interests,
    locations: preferences.locations,
    work_terms: preferences.workTerms,
    min_score: preferences.minScore,
    strategy: preferences.strategy,
    feedback_adaptation: preferences.feedbackAdaptation,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, status: 500, message: "Could not save preferences." };
  return { ok: true };
}

export async function storeCustomSearch(
  prompt: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const service = serviceClient();
  if (!service) return { ok: false, status: 503, message: "Database is not configured." };
  const now = new Date().toISOString();
  const { error } = await service.from("search_runs").insert({
    started_at: now,
    completed_at: now,
    run_type: "custom_search",
    status: "not_implemented",
    prompt,
    error: "Custom search is stored only. Live research is not implemented.",
  });
  if (error) return { ok: false, status: 500, message: "Could not store that search." };
  return { ok: true };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
