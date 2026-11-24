"use client";

import { useCallback, useRef, useState } from "react";
import { ActivityModal } from "@/components/latest-run-panel";
import { RouteMap } from "@/components/route-map";
import type { LatestActivity } from "@/lib/garmin/snapshot";

export function LatestRunCard({ activity, sample = false }: { activity: LatestActivity | null; sample?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeModal = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  return (
    <>
      <article className={`td-card overflow-hidden${activity ? " td-latest-run-panel" : ""}`}>
        <button
          ref={trigger}
          type="button"
          disabled={!activity}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={activity ? `View run details: ${activity.name}, ${activity.dateLabel}` : "No recent run"}
          onClick={() => setOpen(true)}
          className="td-run-card block w-full p-5 text-left"
        >
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
          {activity ? (
            <p className="td-divider mt-4 flex items-center justify-between border-t pt-3 text-xs font-medium text-[var(--td-accent)]">
              View run details <span aria-hidden="true">↗</span>
            </p>
          ) : null}
        </button>
      </article>
      {open && activity ? <ActivityModal activity={activity} onClose={closeModal} showTrainingLink /> : null}
    </>
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
  return <div className="td-skeleton h-96 animate-pulse rounded-[var(--td-radius)]" aria-hidden="true" />;
}
