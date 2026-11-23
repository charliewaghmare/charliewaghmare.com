"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ActivitySparkline, ActivityTraceChart } from "@/components/activity-trace-chart";
import { RouteMap } from "@/components/route-map";
import type { ActivitySample, ActivitySplit } from "@/lib/garmin/activity-detail";
import type { LatestActivity } from "@/lib/garmin/snapshot";

type TabId = "heart-rate" | "pace" | "elevation" | "splits";

export function LatestRunPanel({ activity }: { activity: LatestActivity | null }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const openModal = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    const trigger = opener.current;
    requestAnimationFrame(() => trigger?.focus());
  };

  return (
    <article className={`td-card${activity ? " td-latest-run-panel" : ""} relative flex min-h-[20rem] flex-col p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" className="td-run-card min-w-0 flex-1 text-left" onClick={openModal} disabled={!activity}>
          <p className="td-overline tracking-[0.12em]">Latest run</p>
          <h3 className="type-display td-text mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
            {activity?.name ?? "No recent run"}
          </h3>
          {activity ? (
            <p className="td-muted mt-2 text-[0.8125rem] font-medium leading-5">{activity.whenLabel}</p>
          ) : null}
        </button>
        {activity?.href ? (
          <a
            href={activity.href}
            target="_blank"
            rel="noreferrer"
            className="td-link relative z-10 text-[0.8125rem] font-medium underline"
          >
            View on Garmin ↗
          </a>
        ) : null}
      </div>

      {activity ? (
        <button type="button" className="td-run-card mt-8 flex flex-1 flex-col text-left" onClick={openModal}>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="td-label text-[0.75rem] font-medium">Distance</p>
              <p className="type-metric mt-1 text-[2rem] leading-none sm:text-[2.25rem]">
                <WithUnits text={activity.distanceLabel} />
              </p>
            </div>
            <div>
              <p className="td-label text-[0.75rem] font-medium">Avg pace</p>
              <p className="type-metric mt-1 text-[2rem] leading-none sm:text-[2.25rem]">
                <WithUnits text={activity.paceLabel ?? "—"} />
              </p>
            </div>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FeaturedStat label={activity.durationKind} value={activity.durationLabel} />
            <FeaturedStat label="Avg HR" value={activity.heartRateLabel} />
            <FeaturedStat label="Type" value={activity.typeLabel} />
          </dl>
          <TracePreview activity={activity} />
        </button>
      ) : (
        <p className="td-muted mt-8 text-sm font-normal leading-6">No runs in this window.</p>
      )}

      {open && activity ? <ActivityModal activity={activity} onClose={closeModal} /> : null}
    </article>
  );
}

function TracePreview({ activity }: { activity: LatestActivity }) {
  if (activity.trace === "heart-rate") {
    return (
      <div className="mt-auto pt-6">
        <p className="td-label text-[0.75rem] font-medium">Heart rate</p>
        <ActivitySparkline samples={activity.samples} elapsedSeconds={activity.elapsedSeconds} read={(sample) => sample.heartRate} label="Heart rate over the run" />
      </div>
    );
  }
  if (activity.trace === "pace") {
    return (
      <div className="mt-auto pt-6">
        <p className="td-label text-[0.75rem] font-medium">Pace</p>
        <ActivitySparkline
          samples={activity.samples}
          elapsedSeconds={activity.elapsedSeconds}
          read={(sample) => sample.paceSecondsPerKm}
          label="Pace over the run"
        />
      </div>
    );
  }
  const extras = [activity.elevationLabel ? `${activity.elevationLabel} gain` : null, activity.cadenceLabel, activity.movingLabel ? `${activity.movingLabel} moving` : null].filter(Boolean);
  if (extras.length === 0) return null;
  return <p className="td-muted mt-auto pt-6 text-sm leading-6">{extras.join(" · ")}</p>;
}

export function ActivityModal({
  activity,
  onClose,
  loading = false,
  error = null,
  onRetry,
}: {
  activity: LatestActivity;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabs = availableTabs(activity);
  const [tab, setTab] = useState<TabId>("heart-rate");
  const selected = tabs.includes(tab) ? tab : tabs[0];

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) closeRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", containFocus);
    };
  }, [onClose]);

  const onBackdrop = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  const secondary = [
    ["Max HR", activity.maxHeartRateLabel],
    ["Elevation gain", activity.elevationLabel],
    ["Avg cadence", activity.cadenceLabel],
    ["Avg power", activity.powerLabel],
    ["Moving", activity.movingLabel],
    ["Calories", activity.caloriesLabel],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="td-modal-root" onMouseDown={onBackdrop}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="td-modal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="td-overline tracking-[0.12em]">{activity.typeLabel}</p>
            <h3 id={titleId} className="type-display td-text mt-2 text-[1.75rem] leading-[1.15]">
              {activity.name}
            </h3>
            <p className="td-muted mt-2 text-sm leading-6">{activity.whenLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {activity.href ? (
              <a href={activity.href} target="_blank" rel="noreferrer" className="td-link text-[0.8125rem] font-medium underline">
                Garmin ↗
              </a>
            ) : null}
            <button ref={closeRef} type="button" className="td-modal-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <ModalStat label="Distance" value={activity.distanceLabel} />
          <ModalStat label="Avg pace" value={activity.paceLabel ?? "—"} />
          <ModalStat label={activity.durationKind} value={activity.durationLabel} />
          <ModalStat label="Avg HR" value={activity.heartRateLabel} />
        </dl>
        {secondary.length > 0 ? (
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {secondary.map(([label, value]) => (
              <ModalStat key={label} label={label} value={value} compact />
            ))}
          </dl>
        ) : null}

        {loading ? (
          <div className="mt-8" role="status">
            <p className="td-muted text-sm leading-6">Loading run details…</p>
            <div className="td-skeleton mt-3 h-48 animate-pulse rounded-lg" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="mt-8" role="alert">
            <p className="td-muted text-sm leading-6">{error}</p>
            <button type="button" className="td-range-chip mt-3" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Run details"
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const index = tabs.indexOf(selected);
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                  : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
                setTab(tabs[next]);
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}
            >
              {tabs.map((item) => (
                <button
                  key={item}
                  id={`${titleId}-tab-${item}`}
                  type="button"
                  role="tab"
                  aria-selected={selected === item}
                  aria-controls={`${titleId}-panel`}
                  tabIndex={selected === item ? 0 : -1}
                  className={["td-range-chip", selected === item ? "is-active" : ""].filter(Boolean).join(" ")}
                  onClick={() => setTab(item)}
                >
                  {tabLabel(item)}
                </button>
              ))}
            </div>
            <div
              id={`${titleId}-panel`}
              className="mt-4"
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-${selected}`}
              tabIndex={0}
            >
              {selected === "heart-rate" ? (
                <ActivityTraceChart
                  samples={activity.samples}
                  elapsedSeconds={activity.elapsedSeconds}
                  read={(sample) => sample.heartRate}
                  formatY={(value) => `${Math.round(value)}`}
                  axisLabel="Heart rate in beats per minute"
                  unit="bpm"
                  note="Heart rate against elapsed time."
                />
              ) : null}
              {selected === "pace" ? (
                <ActivityTraceChart
                  samples={activity.samples}
                  elapsedSeconds={activity.elapsedSeconds}
                  read={(sample) => sample.paceSecondsPerKm}
                  formatY={(value) => compactPace(value)}
                  axisLabel="Pace in minutes per kilometer. Slower pace is higher."
                  unit="min/km"
                  note="Pace against elapsed time. Slower pace is higher on the chart."
                />
              ) : null}
              {selected === "elevation" ? (
                <ActivityTraceChart
                  samples={activity.samples}
                  elapsedSeconds={activity.elapsedSeconds}
                  read={(sample) => sample.elevationMeters}
                  formatY={(value) => `${Math.round(value)}`}
                  axisLabel="Elevation in meters against elapsed time"
                  unit="m"
                  area
                  note="Elevation against elapsed time."
                />
              ) : null}
              {selected === "splits" ? <Splits splits={activity.splits} /> : null}
            </div>
          </div>
        )}

        {activity.points.length > 1 ? (
          <div className="mt-8">
            <p className="td-label text-[0.75rem] font-medium">Route</p>
            <RouteMap points={activity.points} className="mt-3 h-48 w-full text-[var(--td-accent)]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Splits({ splits }: { splits: ActivitySplit[] }) {
  if (splits.length === 0) {
    return <p className="td-muted text-sm leading-6">No lap data is available for this run.</p>;
  }
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="sr-only">Run lap data</caption>
        <thead className="td-label text-[0.6875rem] uppercase tracking-[0.08em]">
          <tr>
            <th className="py-2 pr-3 font-medium">Lap</th>
            <th className="py-2 pr-3 font-medium">Distance</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Pace</th>
            <th className="py-2 font-medium">Avg HR</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => (
            <tr key={split.label} className="border-t border-[var(--td-border-subtle)]">
              <td className="py-2 pr-3">{split.label}</td>
              <td className="type-figure py-2 pr-3">{split.distanceLabel}</td>
              <td className="type-figure py-2 pr-3">{split.timeLabel}</td>
              <td className="type-figure py-2 pr-3">{split.paceLabel ?? "—"}</td>
              <td className="type-figure py-2">{split.heartRateLabel ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function availableTabs(activity: LatestActivity): TabId[] {
  const charts: TabId[] = [];
  if (count(activity.samples, (sample) => sample.heartRate) >= 8) charts.push("heart-rate");
  if (count(activity.samples, (sample) => sample.paceSecondsPerKm) >= 8) charts.push("pace");
  const elevation = activity.samples.filter(
    (sample) => sample.elevationMeters !== null,
  );
  const heights = elevation.flatMap((sample) => (sample.elevationMeters === null ? [] : [sample.elevationMeters]));
  if (heights.length >= 8 && Math.max(...heights) - Math.min(...heights) > 3) charts.push("elevation");
  return [...charts, "splits"];
}

function count(samples: ActivitySample[], read: (sample: ActivitySample) => number | null): number {
  return samples.filter((sample) => read(sample) !== null).length;
}

function compactPace(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function tabLabel(chart: TabId): string {
  if (chart === "heart-rate") return "Heart rate";
  if (chart === "pace") return "Pace";
  if (chart === "splits") return "Splits";
  return "Elevation";
}

function ModalStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div>
      <dt className="td-label text-[0.75rem] font-medium">{label}</dt>
      <dd className={compact ? "type-figure td-text mt-1 text-sm" : "type-metric mt-1 text-[1.5rem] leading-none"}>
        <WithUnits text={value} unitClassName={compact ? "type-unit-inline" : "type-unit"} />
      </dd>
    </div>
  );
}

function FeaturedStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="td-label text-[0.75rem] font-medium">{label}</dt>
      <dd className="type-figure td-text mt-1 text-sm">
        <WithUnits text={value} unitClassName="type-unit-inline" />
      </dd>
    </div>
  );
}

const UNIT_PATTERN = /(\/km|\s+km|\s+bpm|\s+ms)/g;

function WithUnits({ text, unitClassName = "type-unit" }: { text: string; unitClassName?: string }) {
  const parts = text.split(UNIT_PATTERN);
  return parts.map((part, index) =>
    part === "/km" || part === " km" || part === " bpm" || part === " ms" ? (
      <span key={`${part}-${index}`} className={unitClassName}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}
