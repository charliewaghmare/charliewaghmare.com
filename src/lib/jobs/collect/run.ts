import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchBoard, SourceFailure } from "@/lib/jobs/collect/fetch-source";
import { persistCollection, type RunSummary, type SourceResult } from "@/lib/jobs/collect/persist";
import { assessPosting } from "@/lib/jobs/collect/rules";
import { shouldRunScheduled } from "@/lib/jobs/collect/schedule";
import { activeBoards, mergeBoards, watchlist, type WatchCompany } from "@/lib/jobs/collect/watchlist";

export async function collectJobs(options: {
  trigger: string;
  runId?: string | null;
  only?: string | null;
  dryRun?: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<RunSummary | null> {
  if (!shouldRunScheduled(options.now ?? new Date(), options.trigger)) {
    console.log("Skipping scheduled run until 6:00 America/Vancouver.");
    return null;
  }
  let boards = activeBoards();
  if (!options.dryRun) {
    const stored = await loadStoredBoards(collectorClient());
    boards = mergeBoards(boards, stored);
  }
  boards = boards.filter((company) =>
    options.only ? company.boardId === options.only || company.name === options.only : true,
  );
  const results: SourceResult[] = [];
  for (const company of boards) {
    try {
      const postings = await fetchBoard(company, options.fetchImpl);
      results.push({ company, ok: true, error: null, postings });
      console.log(`${company.name}: fetched ${postings.length}`);
    } catch (error) {
      const message =
        error instanceof SourceFailure
          ? error.message
          : error instanceof Error
            ? error.message
            : "Source failed";
      results.push({ company, ok: false, error: message, postings: [] });
      console.error(message);
    }
  }
  if (options.dryRun) {
    const summary = emptySummary(results);
    for (const result of results) {
      for (const posting of result.postings) {
        const assessment = assessPosting(posting, options.now);
        if (assessment.publish) {
          summary.eligibleStudent += 1;
          if (assessment.score >= 50) summary.relevant += 1;
          else summary.belowThreshold += 1;
          if (summary.examples.length < 12) {
            summary.examples.push(
              `${posting.companyName}: ${posting.title} (${assessment.tags.join(", ") || "uncategorized"}) ${assessment.score}`,
            );
          }
        } else {
          summary.excluded += 1;
          if (assessment.status === "uncertain") summary.uncertain += 1;
          else if (assessment.status === "ineligible_professional_role") summary.ineligibleProfessional += 1;
        }
      }
    }
    console.log(`Dry run. Nothing was saved. ${JSON.stringify(summary)}`);
    return summary;
  }

  const db = collectorClient();
  const runId = await ensureRun(db, options.runId ?? null);
  await db.from("search_runs").update({ status: "running" }).eq("id", runId);
  try {
    const summary = await persistCollection(db, results, options.only ? boards : watchlist);
    const status = summary.sourcesFailed > 0 && summary.sourcesSucceeded > 0
      ? "partial"
      : summary.sourcesSucceeded === 0
        ? "failed"
        : "success";
    await db
      .from("search_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        discovered_count: summary.fetched,
        added_count: summary.inserted,
        updated_count: summary.updated,
        error: summary.errors.join("; ").slice(0, 1000) || null,
        summary,
      })
      .eq("id", runId);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection failed";
    await db
      .from("search_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message.slice(0, 1000),
      })
      .eq("id", runId);
    throw error;
  }
}

async function loadStoredBoards(db: SupabaseClient): Promise<WatchCompany[]> {
  const { data, error } = await db
    .from("companies")
    .select("name, website, careers_url, ats_provider, ats_board_id, categories, geographic_relevance, enabled, why_interesting")
    .eq("enabled", true)
    .eq("is_sample", false);
  if (error || !data) return [];
  return data.flatMap((row) => {
    const provider = row.ats_provider;
    if (provider !== "greenhouse" && provider !== "lever" && provider !== "ashby") return [];
    if (!row.ats_board_id) return [];
    return [
      {
        name: row.name,
        website: row.website,
        careersUrl: row.careers_url,
        provider,
        boardId: row.ats_board_id,
        region: "global" as const,
        categories: row.categories ?? [],
        geographicRelevance: row.geographic_relevance ?? "",
        enabled: true,
        why: row.why_interesting ?? "Verified board found during research.",
      },
    ];
  });
}

function collectorClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureRun(db: SupabaseClient, runId: string | null): Promise<string> {
  if (runId) return runId;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("search_runs")
    .insert({
      started_at: now,
      run_type: "collection",
      status: "running",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not record the collection run.");
  return data.id as string;
}

export function collectionBoards(): WatchCompany[] {
  return activeBoards();
}

function emptySummary(results: SourceResult[]): RunSummary {
  return {
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
}
