import { RESEARCH_BUDGET } from "@/lib/jobs/research/budget";
import { RESEARCH_TRACKS, type ResearchTrack } from "@/lib/jobs/research/tracks";

export type PlannedQuery = { track: string; query: string };

export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

export function planResearch(input: {
  history?: string[];
  focus?: string | null;
  now?: Date;
  tracksPerRun?: number;
  queriesPerTrack?: number;
  tracks?: ResearchTrack[];
  coverage?: Record<string, number>;
}): PlannedQuery[] {
  const focus = input.focus?.trim();
  if (focus) {
    return [{ track: "manual", query: focus.slice(0, 180) }];
  }
  const tracks = input.tracks ?? RESEARCH_TRACKS;
  const perRun = input.tracksPerRun ?? RESEARCH_BUDGET.tracksPerRun;
  const perTrack = input.queriesPerTrack ?? RESEARCH_BUDGET.queriesPerTrack;
  const seen = new Set((input.history ?? []).map(normalizeQuery));
  const start = tracks.length === 0 ? 0 : Math.floor((input.now ?? new Date()).getTime() / 86_400_000) % tracks.length;
  const coverage = input.coverage ?? {};
  const ranked = tracks
    .map((track, index) => {
      const interest = track.interest === "high" ? 3 : 1;
      const covered = coverage[track.id] ?? 0;
      return {
        track,
        score: interest / (1 + covered),
        rotation: (index - start + tracks.length) % tracks.length,
      };
    })
    .sort((left, right) => right.score - left.score || left.rotation - right.rotation);
  const chosen: PlannedQuery[] = [];
  for (const item of ranked) {
    if (new Set(chosen.map((query) => query.track)).size >= perRun) break;
    const fresh = item.track.queries.filter((query) => !seen.has(normalizeQuery(query)));
    for (const query of fresh.slice(0, perTrack)) {
      chosen.push({ track: item.track.id, query });
      seen.add(normalizeQuery(query));
    }
  }
  return chosen;
}
