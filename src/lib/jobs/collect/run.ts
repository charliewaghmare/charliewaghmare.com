import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchBoard, SourceFailure } from "@/lib/jobs/collect/fetch-source";
import { persistCollection, type RunSummary, type SourceResult } from "@/lib/jobs/collect/persist";
import { shouldRunScheduled } from "@/lib/jobs/collect/schedule";
import { activeBoards, watchlist, type WatchCompany } from "@/lib/jobs/collect/watchlist";

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
  const boards = activeBoards().filter((company) =>
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
    const eligible = results.reduce((sum, result) => sum + result.postings.length, 0);
    console.log(`Dry run. Boards ${boards.length}. Postings fetched ${eligible}. Nothing was saved.`);
    return {
      sourcesChecked: results.length,
      sourcesSucceeded: results.filter((result) => result.ok).length,
      sourcesFailed: results.filter((result) => result.error).length,
      fetched: eligible,
      excluded: 0,
      inserted: 0,
      updated: 0,
      stale: 0,
      closed: 0,
      errors: results.flatMap((result) => (result.error ? [result.error] : [])),
    };
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
