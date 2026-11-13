import type { RunSummary } from "@/lib/jobs/collect/persist";
import { activeBoards, watchlist, type WatchCompany } from "@/lib/jobs/collect/watchlist";
import type { CoverageReport } from "@/lib/jobs/types";

export type { CoverageReport };

export function buildCoverageReport(input: {
  companies?: WatchCompany[];
  collection?: Partial<RunSummary> | null;
  collectionAt?: string | null;
  research?: {
    imported?: number;
    candidates?: number;
    verified?: number;
    eligible?: number;
    duplicates?: number;
    estimatedUsd?: number | null;
    searchCalls?: number;
  } | null;
  researchAt?: string | null;
  history?: { type: string; at: string; eligible: number; inserted: number; cost: number | null }[];
}): CoverageReport {
  const companies = input.companies ?? watchlist;
  const active = activeBoards(companies);
  const collection = input.collection ?? null;
  const research = input.research ?? null;
  return {
    monitored: companies.filter((company) => company.enabled).length,
    verifiedSources: active.length,
    needsAttention: companies
      .filter((company) => company.enabled && (!company.provider || !company.boardId))
      .map((company) => company.name),
    fetched: collection?.fetched ?? 0,
    eligible: collection?.eligibleStudent ?? 0,
    ineligible: collection?.ineligibleProfessional ?? 0,
    uncertain: collection?.uncertain ?? 0,
    withheldEligible: collection?.withheldEligible ?? 0,
    belowThreshold: collection?.belowThreshold ?? 0,
    aboveThreshold: collection?.relevant ?? 0,
    duplicates: collection?.duplicates ?? 0,
    suppressed: collection?.suppressed ?? 0,
    inserted: collection?.inserted ?? 0,
    aiImported: research?.imported ?? 0,
    aiCandidates: research?.candidates ?? 0,
    aiVerified: research?.verified ?? 0,
    aiCost: research?.estimatedUsd ?? null,
    aiSearchCalls: research?.searchCalls ?? null,
    lastCollection: input.collectionAt ?? null,
    lastResearch: input.researchAt ?? null,
    bySource: (collection?.bySource ?? []).map((source) => ({
      name: source.name,
      provider: source.provider,
      fetched: source.fetched,
      eligible: source.eligible,
      aboveThreshold: source.aboveThreshold,
    })),
    history: input.history ?? [],
  };
}
