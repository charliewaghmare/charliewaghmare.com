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
  const ordered = [...tracks.slice(start), ...tracks.slice(0, start)];
  const chosen: PlannedQuery[] = [];
  for (const track of ordered) {
    if (chosen.filter((item) => item.track === track.id).length > 0 && new Set(chosen.map((item) => item.track)).size >= perRun) {
      continue;
    }
    const fresh = track.queries.filter((query) => !seen.has(normalizeQuery(query)));
    if (fresh.length === 0) continue;
    if (new Set(chosen.map((item) => item.track)).size >= perRun && !chosen.some((item) => item.track === track.id)) {
      continue;
    }
    for (const query of fresh.slice(0, perTrack)) {
      chosen.push({ track: track.id, query });
      seen.add(normalizeQuery(query));
    }
  }
  return chosen;
}
