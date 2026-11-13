import type { PlannedQuery } from "@/lib/jobs/research/plan";

export const RESEARCH_DEPTHS = ["quick", "standard", "deep"] as const;
export type ResearchDepth = (typeof RESEARCH_DEPTHS)[number];

export type DepthLimits = {
  maxSearchCalls: number;
  maxToolCallsPerRequest: number;
  maxCandidates: number;
  maxCompanyAdds: number;
  maxSpendUsd: number;
  maxDurationMs: number;
};

/**
 * Approximate ceilings. The provider bills actual usage, so a run stops when the
 * recorded estimate reaches the ceiling. It cannot promise the invoice will match.
 */
export const DEPTH_LIMITS: Record<ResearchDepth, DepthLimits> = {
  quick: {
    maxSearchCalls: 1,
    maxToolCallsPerRequest: 1,
    maxCandidates: 3,
    maxCompanyAdds: 1,
    maxSpendUsd: 0.1,
    maxDurationMs: 3 * 60 * 1000,
  },
  standard: {
    maxSearchCalls: 2,
    maxToolCallsPerRequest: 1,
    maxCandidates: 6,
    maxCompanyAdds: 2,
    maxSpendUsd: 0.35,
    maxDurationMs: 6 * 60 * 1000,
  },
  deep: {
    maxSearchCalls: 4,
    maxToolCallsPerRequest: 2,
    maxCandidates: 8,
    maxCompanyAdds: 3,
    maxSpendUsd: 0.75,
    maxDurationMs: 8 * 60 * 1000,
  },
};

export function parseDepth(value: string | null | undefined): ResearchDepth | null {
  const depth = value?.trim().toLowerCase();
  if (depth === "quick" || depth === "standard" || depth === "deep") return depth;
  return null;
}

export function customScope(prompt: string): { allowInternational: boolean } {
  const text = prompt.toLowerCase();
  const asksOutside =
    /\b(united states|u\.s\.|usa|\bus\b|america|united kingdom|\buk\b|europe|international|worldwide|global|nascar|indycar|formula)\b/.test(
      text,
    );
  const canadaOnly = /\b(only in canada|canada only|within canada)\b/.test(text);
  return { allowInternational: asksOutside && !canadaOnly };
}

export function planCustomQueries(prompt: string, depth: ResearchDepth): PlannedQuery[] {
  const base = prompt.replace(/\s+/g, " ").trim().slice(0, 180);
  const variants = [
    base,
    `${base} internship co-op current university student`.slice(0, 180),
    `${base} summer student undergraduate`.slice(0, 180),
    `${base} student engineer OR summer analyst`.slice(0, 180),
  ];
  const seen = new Set<string>();
  const queries: PlannedQuery[] = [];
  for (const query of variants) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({ track: "custom", query });
    if (queries.length >= DEPTH_LIMITS[depth].maxSearchCalls) break;
  }
  return queries;
}
