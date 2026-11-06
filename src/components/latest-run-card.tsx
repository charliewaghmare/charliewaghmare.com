import Link from "next/link";
import { RouteMap } from "@/components/route-map";
import type { TrainingSnapshot } from "@/lib/garmin/snapshot";

export function LatestRunCard({ snapshot }: { snapshot: TrainingSnapshot }) {
  const activity = snapshot.latestRun;
  const label = activity
    ? `Most recent activity, ${activity.name}, ${activity.distanceLabel}, ${activity.timeLabel}, average pace ${activity.paceLabel}, average heart rate ${activity.heartRateLabel}. Open training.`
    : "Most recent activity. Open training.";

  return (
    <Link
      href="/training"
      aria-label={label}
      className="block overflow-hidden rounded-lg border border-stone-200 bg-white text-stone-900 shadow-sm outline-none transition-colors hover:border-stone-400 focus-visible:border-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-stone-600"
    >
      <div className="px-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">Most recent activity</p>
          {snapshot.source === "sample" ? (
            <span className="shrink-0 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              Sample
            </span>
          ) : (
            <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
              {activity?.dateLabel}
            </span>
          )}
        </div>
        {activity && activity.points.length > 1 ? (
          <RouteMap
            points={activity.points}
            className="mt-2 h-36 w-full text-stone-800 dark:text-stone-100"
          />
        ) : (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            No GPS track for this activity.
          </p>
        )}
        <p className="mt-2 truncate text-xs text-stone-500 dark:text-stone-400">
          {activity ? `${activity.name} · ${activity.dateLabel}` : "Nothing recent"}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-stone-200 px-3 py-3 dark:border-stone-800">
        <Stat label="Distance" value={activity?.distanceLabel ?? "—"} />
        <Stat label="Time" value={activity?.timeLabel ?? "—"} />
        <Stat label="Avg pace" value={activity?.paceLabel ?? "—"} />
        <Stat label="Avg HR" value={activity?.heartRateLabel ?? "—"} />
      </dl>
      <p className="border-t border-stone-200 px-3 py-2 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        Last 30 days
      </p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function LatestRunFallback() {
  return (
    <div
      className="h-72 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800"
      aria-hidden="true"
    />
  );
}
