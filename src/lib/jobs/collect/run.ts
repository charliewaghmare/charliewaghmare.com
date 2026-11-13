import { discoverCommunity } from "@/lib/jobs/collect/discover";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityFeed, type FeedStats } from "@/lib/jobs/collect/community";
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
  const db = options.dryRun ? null : collectorClient();
  const runId = db ? await ensureRun(db, options.runId ?? null) : null;
  try {
    if (db && runId) {
      const { error } = await db.from("search_runs").update({ status: "running" }).eq("id", runId);
      if (error) throw new Error(`Could not start collection run: ${error.message}`);
    }
    let boards = activeBoards();
    const disabledBoards = new Set<string>();
    if (!options.dryRun) {
      const stored = await loadStoredBoards(db!);
      for (const company of stored.filter((item) => !item.enabled)) disabledBoards.add(`${company.provider}:${company.boardId}`);
      boards = mergeBoards(boards.filter((company) => !disabledBoards.has(`${company.provider}:${company.boardId}`)), stored);
    }
    boards = boards.filter((company) =>
      options.only ? company.boardId === options.only || company.name === options.only : true,
    );
    const results: SourceResult[] = await mapPool(boards, 4, async (company) => {
      try {
        const snapshot = { complete: false };
        const postings = await fetchBoard(company, options.fetchImpl, snapshot);
        console.log(`${company.name}: fetched ${postings.length}`);
        return { company, ok: true, error: null, postings, complete: snapshot.complete };
      } catch (error) {
        const message =
          error instanceof SourceFailure
            ? error.message
            : error instanceof Error
              ? error.message
              : "Source failed";
        console.error(message);
        return { company, ok: false, error: message, postings: [] };
      }
    });
    let feedStats: FeedStats = emptyFeed();
    let feedCompanies: WatchCompany[] = [];
    if (!options.only) {
      try {
        const feed = await loadCommunityFeed(disabledBoards, options.fetchImpl, options.now);
        feedStats = feed.stats;
        const discovered = await discoverCommunity(feed, results, options.fetchImpl, options.now);
        feedCompanies = discovered.results.map((item) => item.company);
        for (const item of discovered.results) {
          // A successful retry supersedes a failed snapshot for the same board.
          const index = results.findIndex((prior) => prior.company.provider === item.company.provider && prior.company.boardId === item.company.boardId && item.company.boardId);
          if (index >= 0) results[index] = item;
          else results.push(item);
        }
        for (const note of discovered.diagnostics) console.log(note);
        console.log(`Community feed: kept ${feed.stats.kept} of ${feed.stats.raw}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Community feed failed";
        results.push({
          company: {
            name: "internship-radar",
            website: "https://github.com/IS-tib/internship-radar",
            careersUrl: null,
            provider: null,
            boardId: null,
            region: "global",
            categories: [],
            geographicRelevance: "",
            enabled: true,
            listingSource: "web",
            why: "MIT-licensed community feed.",
          },
          ok: false,
          error: message,
          postings: [],
        });
        console.error(message);
      }
    }
    if (options.dryRun) {
      const summary = emptySummary(results);
      for (const result of results) {
        const tally = {
          name: result.company.name,
          provider: result.company.provider ?? "unknown",
          fetched: result.postings.length,
          eligible: 0,
          ineligible: 0,
          uncertain: 0,
          withheldEligible: 0,
          aboveThreshold: 0,
          belowThreshold: 0,
        };
        for (const posting of result.postings) {
          const assessment = assessPosting(posting, options.now);
          if (assessment.publish) {
            summary.eligibleStudent += 1;
            if (assessment.score >= 50) {
              summary.relevant += 1;
              tally.aboveThreshold += 1;
            } else {
              summary.belowThreshold += 1;
              tally.belowThreshold += 1;
            }
            tally.eligible += 1;
            if (summary.examples.length < 12) {
              summary.examples.push(
                `${posting.companyName}: ${posting.title} (${assessment.tags.join(", ") || "uncategorized"}) ${assessment.score}`,
              );
            }
          } else {
            summary.excluded += 1;
            if (assessment.status === "eligible_student_role") {
              summary.withheldEligible += 1;
              tally.withheldEligible += 1;
            } else if (assessment.status === "uncertain") {
              summary.uncertain += 1;
              tally.uncertain += 1;
            } else if (assessment.status === "ineligible_professional_role") {
              summary.ineligibleProfessional += 1;
              tally.ineligible += 1;
            }
          }
        }
        summary.bySource.push(tally);
      }
      applyFeedStats(summary, feedStats);
      console.log(`Dry run. Nothing was saved. ${JSON.stringify(summary)}`);
      return summary;
    }

    if (!db || !runId) throw new Error("Collection database is unavailable.");
    const summary = await persistCollection(db, results, options.only ? boards : mergeCompanies([...watchlist, ...boards, ...feedCompanies]));
    applyFeedStats(summary, feedStats);
    const status = summary.sourcesFailed > 0 && summary.sourcesSucceeded > 0
      ? "partial"
      : summary.sourcesSucceeded === 0
        ? "failed"
        : "success";
    const { error: completionError } = await db
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
    if (completionError) throw new Error(`Could not finish collection run: ${completionError.message}`);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection failed";
    if (db && runId) await db
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
    .eq("is_sample", false);
  if (error) throw new Error(`Could not load monitored boards: ${error.message}`);
  if (!data) return [];
  return data.flatMap((row) => {
    const provider = row.ats_provider;
    if (
      provider !== "greenhouse" &&
      provider !== "lever" &&
      provider !== "ashby" &&
      provider !== "smartrecruiters" &&
      provider !== "workable" &&
      provider !== "workday"
    ) {
      return [];
    }
    if (!row.ats_board_id) return [];
    return [
      {
        name: row.name,
        website: row.website,
        careersUrl: row.careers_url,
        provider,
        boardId: row.ats_board_id,
        region: row.careers_url?.includes("jobs.eu.lever.co") ? "eu" as const : "global" as const,
        categories: row.categories ?? [],
        geographicRelevance: row.geographic_relevance ?? "",
        enabled: row.enabled,
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

function emptyFeed(): FeedStats {
  return {
    raw: 0,
    closed: 0,
    rejectedLink: 0,
    duplicateBoard: 0,
    ineligible: 0,
    uncertain: 0,
    geography: 0,
    kept: 0,
  };
}

function applyFeedStats(summary: RunSummary, stats: FeedStats): void {
  summary.feedRaw = stats.raw;
  summary.feedClosed = stats.closed;
  summary.feedRejectedLink = stats.rejectedLink;
  summary.feedDuplicateBoard = stats.duplicateBoard;
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
}

function mergeCompanies(companies: WatchCompany[]): WatchCompany[] {
  const merged = new Map<string, WatchCompany>();
  for (const company of companies) {
    const prior = merged.get(company.name);
    if (!prior?.provider || company.provider) merged.set(company.name, company);
  }
  return [...merged.values()];
}
