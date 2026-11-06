import Link from "next/link";
import { RouteMap } from "@/components/route-map";
import type { TrainingSnapshot } from "@/lib/garmin/snapshot";

export function LatestRunCard({ snapshot }: { snapshot: TrainingSnapshot }) {
  const run = snapshot.latestRun;
  const label = run
    ? `Latest run, ${run.distanceLabel}, ${run.timeLabel}, average heart rate ${run.heartRateLabel}. Open training.`
    : "Latest run. Open training.";

  return (
    <Link
      href="/training"
      aria-label={label}
      className="block overflow-hidden rounded-lg border border-stone-200 bg-white text-stone-900 shadow-sm outline-none transition-colors hover:border-stone-400 focus-visible:border-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-stone-600"
    >
      <div className="relative h-44 bg-stone-900 text-stone-100">
        <RouteMap
          points={run?.points ?? []}
          className="absolute inset-0 h-full w-full text-stone-100"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/10 to-stone-950/45" />
        <div className="absolute inset-x-3 top-2.5 flex items-start justify-between gap-3 text-xs">
          <p className="truncate font-medium">{run?.name ?? "Latest run"}</p>
          {snapshot.source === "sample" ? (
            <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              Sample
            </span>
          ) : (
            <span className="shrink-0 text-white/70">{run?.dateLabel}</span>
          )}
        </div>
        <dl className="absolute inset-x-3 bottom-2.5 grid grid-cols-3 gap-2">
          <Stat label="Distance" value={run?.distanceLabel ?? "—"} />
          <Stat label="Time" value={run?.timeLabel ?? "—"} />
          <Stat label="Avg HR" value={run ? `${run.heartRateLabel}` : "—"} />
        </dl>
      </div>
      <p className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
        {run ? `${run.dateLabel} · Last 30 days` : "Last 30 days"}
      </p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-white/65">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

export function LatestRunFallback() {
  return (
    <div
      className="h-52 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800"
      aria-hidden="true"
    />
  );
}
