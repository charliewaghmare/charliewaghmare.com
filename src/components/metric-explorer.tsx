"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  CategoryHistoryList,
  MetricHistoryChart,
} from "@/components/metric-history-chart";
import { MetricSparkline } from "@/components/metric-sparkline";
import { addDays, vancouverToday } from "@/lib/garmin/format";
import {
  filterCategories,
  filterSeries,
  sparklinePoints,
  type DashboardMetric,
} from "@/lib/garmin/series";

const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "1y", label: "1 year", days: 365 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

export function MetricExplorer({
  metrics,
  primaryIds,
  secondaryIds,
  featuredSlot,
}: {
  metrics: DashboardMetric[];
  primaryIds: string[];
  secondaryIds: string[];
  featuredSlot?: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openMetric = metrics.find((metric) => metric.id === openId) ?? null;
  const byId = useMemo(
    () => new Map(metrics.map((metric) => [metric.id, metric])),
    [metrics],
  );
  const primary = primaryIds
    .map((id) => byId.get(id))
    .filter((metric): metric is DashboardMetric => Boolean(metric));
  const secondary = secondaryIds
    .map((id) => byId.get(id))
    .filter((metric): metric is DashboardMetric => Boolean(metric));

  const openMetricById = useCallback((id: string, trigger: HTMLElement) => {
    openerRef.current = trigger;
    setOpenId(id);
  }, []);

  const closeModal = useCallback(() => {
    setOpenId(null);
    const opener = openerRef.current;
    openerRef.current = null;
    queueMicrotask(() => opener?.focus());
  }, []);

  return (
    <>
      {primary.length > 0 ? (
        <section className="mt-10" aria-labelledby="primary-metrics-heading">
          <h2
            id="primary-metrics-heading"
            className="type-section td-text text-[1.125rem] leading-tight sm:text-[1.25rem]"
          >
            Now
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {primary.map((metric) => (
              <MetricCardButton
                key={metric.id}
                metric={metric}
                onOpen={(trigger) => openMetricById(metric.id, trigger)}
                className={
                  metric.id === "status" ? "col-span-2 md:col-span-1" : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {featuredSlot}

      {secondary.length > 0 ? (
        <section className="mt-12" aria-labelledby="secondary-metrics-heading">
          <h2
            id="secondary-metrics-heading"
            className="type-section td-text text-[1.125rem] leading-tight sm:text-[1.25rem]"
          >
            Recovery and targets
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {secondary.map((metric) => (
              <MetricCardButton
                key={metric.id}
                metric={metric}
                onOpen={(trigger) => openMetricById(metric.id, trigger)}
                className={metric.id === "balance" ? "col-span-2" : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {openMetric ? (
        <MetricModal metric={openMetric} onClose={closeModal} />
      ) : null}
    </>
  );
}

function MetricCardButton({
  metric,
  onOpen,
  className,
}: {
  metric: DashboardMetric;
  onOpen: (trigger: HTMLElement) => void;
  className?: string;
}) {
  const textual = /[A-Za-z]{3,}/.test(metric.value.replace(/[^A-Za-z]/g, ""));
  const spark =
    metric.kind === "numeric" ? sparklinePoints(metric.series, 30) : [];

  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-haspopup="dialog"
      className={[
        "td-card td-metric-card flex min-h-[8.5rem] flex-col px-4 py-4 text-left",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="td-label text-[0.8125rem] font-medium leading-5">
          {metric.label}
        </p>
        <span className="td-expand-icon" aria-hidden="true">
          ⌝
        </span>
      </div>
      <p
        className={[
          "type-metric mt-2 leading-[1.15]",
          textual
            ? "text-[1.375rem] sm:text-[1.5rem]"
            : "text-[1.75rem] sm:text-[1.875rem]",
        ].join(" ")}
      >
        <WithUnits text={metric.value} />
      </p>
      <p className="td-muted mt-2 min-h-5 text-[0.8125rem] font-normal leading-5">
        {metric.detail ?? metric.explanation}
      </p>
      <div className="td-divider mt-auto border-t border-dashed pt-3">
        {spark.length >= 2 ? (
          <MetricSparkline points={spark} />
        ) : (
          <p className="td-muted text-[0.6875rem]">
            {metric.kind === "categorical"
              ? "Tap for status history"
              : "No trend yet"}
          </p>
        )}
      </div>
    </button>
  );
}

function MetricModal({
  metric,
  onClose,
}: {
  metric: DashboardMetric;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<RangeId>("30d");
  const end = vancouverToday();

  const selected = RANGES.find((item) => item.id === range) ?? RANGES[1];
  const start = addDays(end, -(selected.days - 1));
  const numeric = filterSeries(metric.series, start, end);
  const categorical = filterCategories(metric.categories, start, end);
  const availableDays =
    metric.kind === "numeric"
      ? spanDays(metric.series)
      : spanDays(metric.categories);
  const rangeSupported =
    availableDays === 0 ? false : availableDays >= Math.min(selected.days, 7);

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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdrop = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="td-modal-root" onMouseDown={onBackdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="td-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="td-overline tracking-[0.12em]">{metric.label}</p>
            <h3
              id={titleId}
              className="type-display td-text mt-2 text-[1.75rem] leading-[1.15]"
            >
              <WithUnits text={metric.value} />
            </h3>
            <p className="td-muted mt-2 max-w-xl text-sm leading-6">
              {metric.explanation}
              {metric.detail ? ` ${metric.detail}.` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="td-modal-close shrink-0"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div
          className="mt-6 flex flex-wrap gap-2"
          role="tablist"
          aria-label="History range"
        >
          {RANGES.map((item) => {
            const supported =
              availableDays === 0 || availableDays >= Math.min(item.days, 7);
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={range === item.id}
                className={[
                  "td-range-chip",
                  range === item.id ? "is-active" : "",
                  !supported ? "is-limited" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {!rangeSupported && availableDays > 0 ? (
          <p className="td-muted mt-3 text-[0.8125rem] leading-5">
            Recorded history covers about {availableDays} day
            {availableDays === 1 ? "" : "s"}. Longer ranges only show the
            readings that exist.
          </p>
        ) : null}

        <div className="mt-6">
          {metric.kind === "numeric" ? (
            numeric.length > 0 ? (
              <MetricHistoryChart points={numeric} unit={metric.unit} />
            ) : (
              <p className="td-muted text-sm leading-6">
                {metric.historyNote ??
                  `No ${metric.label.toLowerCase()} history in the selected ${selected.label.toLowerCase()}.`}
              </p>
            )
          ) : categorical.length > 0 ? (
            <CategoryHistoryList points={categorical} />
          ) : (
            <p className="td-muted text-sm leading-6">
              {metric.historyNote ??
                `Historical ${metric.label.toLowerCase()} readings are not available from Garmin yet.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function spanDays(points: { iso: string }[]): number {
  if (points.length === 0) return 0;
  const first = points[0].iso;
  const last = points[points.length - 1].iso;
  const a = Date.parse(`${first}T12:00:00Z`);
  const b = Date.parse(`${last}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return points.length;
  return Math.floor(Math.abs(b - a) / 86400000) + 1;
}

const UNIT_PATTERN = /(\/km|\s+km|\s+bpm|\s+ms)/g;

function WithUnits({
  text,
  unitClassName = "type-unit",
}: {
  text: string;
  unitClassName?: string;
}) {
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
