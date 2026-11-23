"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityModal } from "@/components/latest-run-panel";
import { WithUnits } from "@/components/training-units";
import type { LatestActivity } from "@/lib/garmin/snapshot";

export function RunsList({
  activities,
  latestActivity,
}: {
  activities: LatestActivity[];
  latestActivity: LatestActivity | null;
}) {
  const [selected, setSelected] = useState<LatestActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = useRef(new Map<string, LatestActivity>());
  const request = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const closeModal = useCallback(() => {
    request.current?.abort();
    setSelected(null);
    setLoading(false);
    setError(null);
    const trigger = opener.current;
    requestAnimationFrame(() => trigger?.focus());
  }, []);

  const loadActivity = async (activity: LatestActivity) => {
    request.current?.abort();
    setError(null);
    const cached = latestActivity?.id === activity.id ? latestActivity : details.current.get(activity.id);
    if (cached) {
      setSelected(cached);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setSelected(activity);
    setLoading(true);
    try {
      const response = await fetch(`/api/training/activities/${encodeURIComponent(activity.id)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to load run");
      const body = await response.json() as { activity: LatestActivity };
      if (body.activity?.id !== activity.id) throw new Error("Unexpected run");
      if (controller.signal.aborted) return;
      details.current.set(activity.id, body.activity);
      setSelected(body.activity);
    } catch {
      if (!controller.signal.aborted) setError("Run details couldn’t be loaded. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <>
      <ul className="mt-4 divide-y divide-[var(--td-border-subtle)]">
        {activities.map((activity) => (
          <li key={activity.id}>
            <button
              type="button"
              className="td-activity-row -mx-2 grid w-[calc(100%+1rem)] cursor-pointer gap-2 rounded-lg px-2 py-4 text-left sm:grid-cols-[minmax(0,1.2fr)_minmax(0,28rem)] sm:items-baseline sm:gap-8"
              aria-haspopup="dialog"
              aria-label={`Open ${activity.name}, ${activity.dateLabel}`}
              onClick={(event) => {
                opener.current = event.currentTarget;
                void loadActivity(activity);
              }}
            >
              <div className="min-w-0">
                <p className="td-activity-link text-[0.9375rem] font-semibold leading-snug">{activity.name}</p>
                <p className="td-muted mt-1 text-[0.8125rem] font-medium leading-5">
                  {activity.dateLabel}
                  {activity.run ? "" : ` · ${activity.typeLabel}`}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 sm:text-right">
                <ActivityStat label="Distance" value={activity.distanceLabel} />
                <ActivityStat label="Duration" value={activity.timeLabel} />
                <ActivityStat label="Pace" value={activity.paceLabel} />
                <ActivityStat label="Avg HR" value={activity.heartRateLabel} />
              </dl>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <ActivityModal
          key={selected.id}
          activity={selected}
          onClose={closeModal}
          loading={loading}
          error={error}
          onRetry={() => void loadActivity(selected)}
        />
      ) : null}
    </>
  );
}

function ActivityStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="td-label text-[0.6875rem] font-medium uppercase tracking-[0.08em] sm:sr-only">{label}</dt>
      <dd className="type-figure td-text mt-1 text-[0.8125rem] sm:mt-0 sm:text-sm">
        <WithUnits text={value ?? "—"} unitClassName="type-unit-inline" />
      </dd>
    </div>
  );
}
