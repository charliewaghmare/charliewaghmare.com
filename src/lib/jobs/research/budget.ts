/**
 * Official rates checked against https://developers.openai.com/api/docs/pricing on 2026-11-12.
 * Dollars are computed only when the API returns token counts. Unknown models are not guessed.
 */
const MODEL_RATES: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-6-astra": { inputPerMillion: 10, outputPerMillion: 50 },
  "gpt-6.1-sol": { inputPerMillion: 2, outputPerMillion: 10 },
  "gpt-6.1-terra": { inputPerMillion: 1, outputPerMillion: 5 },
  "gpt-6-luna": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  "gpt-6-sol": { inputPerMillion: 2, outputPerMillion: 10 },
};

export const WEB_SEARCH_USD_PER_THOUSAND = 10;

export const RESEARCH_BUDGET = {
  tracksPerRun: 2,
  queriesPerTrack: 2,
  maxSearchCalls: 4,
  maxToolCallsPerRequest: 2,
  maxCandidates: 8,
  maxCompanyAdds: 3,
  maxSpendUsd: 0.75,
  maxDurationMs: 8 * 60 * 1000,
};

export const WEB_SEARCH_MODELS = new Set([
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
]);

export function researchLimits(env: Record<string, string | undefined> = process.env): typeof RESEARCH_BUDGET {
  return {
    ...RESEARCH_BUDGET,
    tracksPerRun: positiveInt(env.RESEARCH_TRACKS_PER_RUN, RESEARCH_BUDGET.tracksPerRun),
    queriesPerTrack: positiveInt(env.RESEARCH_QUERIES_PER_TRACK, RESEARCH_BUDGET.queriesPerTrack),
    maxSearchCalls: positiveInt(env.RESEARCH_MAX_CALLS, RESEARCH_BUDGET.maxSearchCalls),
    maxToolCallsPerRequest: positiveInt(env.RESEARCH_MAX_TOOL_CALLS, RESEARCH_BUDGET.maxToolCallsPerRequest),
    maxCandidates: positiveInt(env.RESEARCH_MAX_VERIFICATIONS, RESEARCH_BUDGET.maxCandidates),
    maxSpendUsd: positiveNumber(env.RESEARCH_MAX_SPEND_USD, RESEARCH_BUDGET.maxSpendUsd),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  searchCalls: number;
};

export function estimateResearchUsd(model: string, usage: Usage): number | null {
  const rates = MODEL_RATES[model];
  if (!rates) return null;
  const tokens =
    (usage.inputTokens / 1_000_000) * rates.inputPerMillion +
    (usage.outputTokens / 1_000_000) * rates.outputPerMillion;
  const search = (usage.searchCalls / 1000) * WEB_SEARCH_USD_PER_THOUSAND;
  return Math.round((tokens + search) * 10000) / 10000;
}

export function addUsage(left: Usage, right: Usage): Usage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    searchCalls: left.searchCalls + right.searchCalls,
  };
}
