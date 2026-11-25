import Link from "next/link";
import { RouteMap } from "@/components/route-map";
import type { LatestActivity } from "@/lib/garmin/snapshot";

export function LatestRunCard({ activity, sample = false }: { activity: LatestActivity | null; sample?: boolean }) {
  return (
    <Link href="/training" aria-label="View my training" className="td-card home-run-link relative block overflow-hidden">
      <div className="home-run-content p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="td-overline">Latest run</p>
          {sample ? (
            <span className="td-muted border border-[var(--td-border)] px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide">
              Sample
            </span>
          ) : null}
        </div>
        <h2 className="type-display td-text mt-2 text-[1.75rem] leading-tight">
          {activity?.name ?? "No recent run"}
        </h2>
        <p className="td-muted mt-1 text-xs leading-5">
          {activity?.whenLabel ?? "No runs in the last 30 days."}
        </p>
        {activity && activity.points.length > 1 ? (
          <RouteMap points={activity.points} className="mt-3 h-36 w-full text-[var(--td-accent)]" />
        ) : (
          <p className="td-muted my-6 text-xs">No GPS track for this activity.</p>
        )}
        <dl className="td-divider mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t pt-4">
          <Stat label="Distance" value={activity?.distanceLabel ?? "—"} />
          <Stat label="Time" value={activity?.timeLabel ?? "—"} />
          <Stat label="Avg pace" value={activity?.paceLabel ?? "—"} />
          <Stat label="Avg HR" value={activity?.heartRateLabel ?? "—"} />
        </dl>
        <p className="td-divider mt-4 flex items-center justify-between border-t pt-3 text-xs font-medium text-[var(--td-accent)]">
          View my training <span aria-hidden="true">↗</span>
        </p>
      </div>
      <span className="home-run-overlay" aria-hidden="true">
        <span className="home-run-cta">View my training <span>↗</span></span>
      </span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="td-label text-[0.625rem] uppercase tracking-wide">{label}</dt>
      <dd className="type-figure td-text mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

export function LatestRunFallback() {
  return (
    <Link href="/training" aria-label="View my training" className="td-card home-run-link block p-5">
      <div className="td-skeleton h-80 animate-pulse rounded-[var(--td-radius)]" aria-hidden="true" />
      <p className="td-divider mt-4 flex items-center justify-between border-t pt-3 text-xs font-medium text-[var(--td-accent)]">
        View my training <span aria-hidden="true">↗</span>
      </p>
    </Link>
  );
}
