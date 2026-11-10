import Link from "next/link";
import type { PersonalBest } from "@/content/personal-bests";
import { site } from "@/content/site";
import { formatDay } from "@/lib/garmin/format";
import type { ActivityRow, TrainingSnapshot } from "@/lib/garmin/snapshot";

const PRIMARY_LABELS = [
  "Training status",
  "Training load",
  "VO2 max",
  "HRV",
  "Readiness",
] as const;

const SECONDARY_WIDE = new Set(["Training balance"]);

export function TrainingView({
  snapshot,
  bests,
}: {
  snapshot: TrainingSnapshot;
  bests: PersonalBest[];
}) {
  const maxKm = Math.max(...snapshot.days.map((day) => day.km), 0);
  const byLabel = new Map(snapshot.metrics.map((metric) => [metric.label, metric]));
  const primary = PRIMARY_LABELS.map((label) => byLabel.get(label)).filter(
    (metric): metric is NonNullable<typeof metric> => Boolean(metric),
  );
  const primarySet = new Set<string>(PRIMARY_LABELS);
  const secondary = snapshot.metrics.filter((metric) => !primarySet.has(metric.label));
  const latestRun = snapshot.activities[0] ?? null;

  return (
    <>
      <header className="border-b border-stone-200 pb-8 dark:border-stone-800">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
              <Link
                href="/"
                className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:decoration-stone-700"
              >
                {site.name}
              </Link>
              <span aria-hidden="true"> / </span>
              <span>Training</span>
            </p>
            <h1 className="type-display mt-3 text-[2.125rem] leading-[1.1] sm:text-[3rem]">
              Training
            </h1>
            <p className="mt-3 max-w-xl text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
              A live look at the numbers behind the miles.
            </p>
          </div>
          <div className="shrink-0 text-left lg:text-right">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">
              Last 30 days
            </p>
            <p className="type-figure mt-1 text-[0.8125rem] text-stone-600 dark:text-stone-300">
              {snapshot.rangeLabel}
            </p>
          </div>
        </div>
        {snapshot.note ? (
          <p className="mt-6 max-w-2xl text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
            {snapshot.note}
          </p>
        ) : null}
      </header>

      {primary.length > 0 ? (
        <section className="mt-10" aria-labelledby="primary-metrics-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="primary-metrics-heading"
              className="type-section text-[1.125rem] leading-tight text-stone-800 sm:text-[1.25rem] dark:text-stone-100"
            >
              Now
            </h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {primary.map((metric) => (
              <MetricCard
                key={metric.label}
                metric={metric}
                className={
                  metric.label === "Training status"
                    ? "col-span-2 md:col-span-1"
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="mt-12 grid gap-4 lg:grid-cols-2 lg:gap-5"
        aria-labelledby="featured-heading"
      >
        <h2 id="featured-heading" className="sr-only">
          Latest run and training overview
        </h2>
        <LatestRunPanel activity={latestRun} />
        <TrainingOverviewPanel
          totalsLabel={snapshot.totalsLabel}
          days={snapshot.days}
          maxKm={maxKm}
        />
      </section>

      {secondary.length > 0 ? (
        <section className="mt-12" aria-labelledby="secondary-metrics-heading">
          <h2
            id="secondary-metrics-heading"
            className="type-section text-[1.125rem] leading-tight text-stone-800 sm:text-[1.25rem] dark:text-stone-100"
          >
            Recovery and targets
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {secondary.map((metric) => (
              <MetricCard
                key={metric.label}
                metric={metric}
                className={
                  SECONDARY_WIDE.has(metric.label)
                    ? "col-span-2"
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-14 border-t border-stone-200 pt-10 dark:border-stone-800" aria-labelledby="runs-heading">
        <h2
          id="runs-heading"
          className="type-display text-[1.375rem] leading-[1.15] text-stone-800 sm:text-[1.625rem] dark:text-stone-100"
        >
          Runs
        </h2>
        {snapshot.activities.length > 0 ? (
          <ul className="mt-6 divide-y divide-stone-200 dark:divide-stone-800">
            {snapshot.activities.map((activity) => (
              <li
                key={activity.id}
                className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:items-baseline sm:gap-8"
              >
                <div className="min-w-0">
                  {activity.href ? (
                    <a
                      href={activity.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.9375rem] font-semibold leading-snug underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:decoration-stone-700"
                    >
                      {activity.name}
                    </a>
                  ) : (
                    <p className="text-[0.9375rem] font-semibold leading-snug">
                      {activity.name}
                    </p>
                  )}
                  <p className="mt-1 text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
            No runs in this window.
          </p>
        )}
      </section>

      <section className="mt-14 border-t border-stone-200 pt-10 dark:border-stone-800" aria-labelledby="bests-heading">
        <h2
          id="bests-heading"
          className="type-display text-[1.375rem] leading-[1.15] text-stone-800 sm:text-[1.625rem] dark:text-stone-100"
        >
          Personal bests
        </h2>
        {bests.length > 0 ? (
          <ul className="mt-6 divide-y divide-stone-200 dark:divide-stone-800">
            {bests.map((best) => (
              <li
                key={`${best.event}-${best.date}-${best.mark}`}
                className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
              >
                <div>
                  <p className="text-[0.9375rem] font-semibold leading-snug">{best.event}</p>
                  <p className="mt-1 text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
                    {best.date ? formatBestDate(best.date) : "Date not set"}
                    {best.note ? ` · ${best.note}` : ""}
                  </p>
                </div>
                <p className="type-figure text-[0.9375rem] font-medium">
                  <WithUnits text={best.mark} unitClassName="type-unit-inline" />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
            None yet. Add one in{" "}
            <code className="text-code">src/content/personal-bests.ts</code>.
          </p>
        )}
      </section>
    </>
  );
}

function MetricCard({
  metric,
  className,
}: {
  metric: { label: string; value: string; detail?: string };
  className?: string;
}) {
  const textual = isTextualMetric(metric.value);

  return (
    <article
      className={[
        "flex min-h-[8.5rem] flex-col rounded-lg border border-stone-200 px-4 py-4 dark:border-stone-800",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
        {metric.label}
      </p>
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
      {metric.detail ? (
        <p className="mt-2 text-[0.8125rem] font-normal leading-5 text-stone-500 dark:text-stone-400">
          <WithUnits text={metric.detail} unitClassName="type-unit-inline" />
        </p>
      ) : (
        <p className="mt-2 text-[0.8125rem] leading-5 text-transparent" aria-hidden="true">
          —
        </p>
      )}
      <div
        className="mt-auto min-h-8 border-t border-dashed border-stone-200 pt-3 dark:border-stone-800"
        aria-hidden="true"
      />
    </article>
  );
}

function LatestRunPanel({ activity }: { activity: ActivityRow | null }) {
  return (
    <article className="flex min-h-[22rem] flex-col rounded-lg border border-stone-200 p-5 sm:p-6 dark:border-stone-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">
            Latest run
          </p>
          {activity ? (
            <>
              <h3 className="type-display mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
                {activity.href ? (
                  <a
                    href={activity.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:decoration-stone-700"
                  >
                    {activity.name}
                  </a>
                ) : (
                  activity.name
                )}
              </h3>
              <p className="mt-2 text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
                {activity.dateLabel}
              </p>
            </>
          ) : (
            <h3 className="type-display mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
              No recent run
            </h3>
          )}
        </div>
        {activity?.href ? (
          <a
            href={activity.href}
            target="_blank"
            rel="noreferrer"
            className="text-[0.8125rem] font-medium text-stone-600 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:text-stone-300 dark:decoration-stone-700"
          >
            View on Garmin
          </a>
        ) : null}
      </div>

      {activity ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[0.75rem] font-medium text-stone-500 dark:text-stone-400">
                Distance
              </p>
              <p className="type-metric mt-1 text-[2rem] leading-none sm:text-[2.25rem]">
                <WithUnits text={activity.distanceLabel} />
              </p>
            </div>
            <div>
              <p className="text-[0.75rem] font-medium text-stone-500 dark:text-stone-400">
                Avg pace
              </p>
              <p className="type-metric mt-1 text-[2rem] leading-none sm:text-[2.25rem]">
                <WithUnits text={activity.paceLabel ?? "—"} />
              </p>
            </div>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FeaturedStat label="Duration" value={activity.timeLabel} />
            <FeaturedStat label="Avg HR" value={activity.heartRateLabel} />
            <FeaturedStat label="Type" value={activity.typeLabel} />
          </dl>
          <div
            className="mt-auto min-h-24 border-t border-dashed border-stone-200 pt-4 dark:border-stone-800"
            aria-hidden="true"
          />
        </>
      ) : (
        <p className="mt-8 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
          No runs in this window.
        </p>
      )}
    </article>
  );
}

function TrainingOverviewPanel({
  totalsLabel,
  days,
  maxKm,
}: {
  totalsLabel: string;
  days: TrainingSnapshot["days"];
  maxKm: number;
}) {
  return (
    <article className="flex min-h-[22rem] flex-col rounded-lg border border-stone-200 p-5 sm:p-6 dark:border-stone-800">
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">
        Training overview
      </p>
      <h3 className="type-display mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
        Last 30 days
      </h3>
      <p className="type-figure mt-3 text-sm text-stone-600 dark:text-stone-300">
        <WithUnits text={totalsLabel} unitClassName="type-unit-inline" />
      </p>
      <div className="mt-6 flex-1">
        <DistanceChart days={days} maxKm={maxKm} />
      </div>
      <p className="mt-4 text-[0.8125rem] font-normal leading-5 text-stone-500 dark:text-stone-400">
        Daily run distance for the current window. A fuller load history will land here later.
      </p>
    </article>
  );
}

function FeaturedStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] font-medium text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="type-figure mt-1 text-sm text-stone-800 dark:text-stone-100">
        <WithUnits text={value} unitClassName="type-unit-inline" />
      </dd>
    </div>
  );
}

function ActivityStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
        {label}
      </dt>
      <dd className="type-figure mt-1 text-[0.8125rem] text-stone-700 sm:text-sm dark:text-stone-200">
        <WithUnits text={value ?? "—"} unitClassName="type-unit-inline" />
      </dd>
    </div>
  );
}

function DistanceChart({
  days,
  maxKm,
}: {
  days: TrainingSnapshot["days"];
  maxKm: number;
}) {
  const peak = maxKm > 0 ? maxKm : 1;
  return (
    <div>
      <svg
        viewBox={`0 0 ${days.length * 12} 96`}
        className="h-36 w-full text-stone-800 sm:h-44 dark:text-stone-200"
        role="img"
        aria-label="Run distance over the last 30 days"
      >
        {days.map((day, index) => {
          const height = day.km > 0 ? Math.max(4, (day.km / peak) * 84) : 2;
          const y = 90 - height;
          return (
            <g key={day.iso}>
              <title>
                {day.label}: {day.km > 0 ? `${day.km.toFixed(1)} km` : "no run"}
              </title>
              <rect
                x={index * 12 + 2}
                y={y}
                width="8"
                height={height}
                rx="1.5"
                fill="currentColor"
                opacity={day.km > 0 ? 0.9 : 0.18}
              />
            </g>
          );
        })}
      </svg>
      <div className="type-figure mt-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>{days[0] ? formatDay(days[0].iso, false) : ""}</span>
        <span>
          {days.length > 0 ? formatDay(days[days.length - 1].iso, false) : ""}
        </span>
      </div>
    </div>
  );
}

function formatBestDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatDay(value);
}

function isTextualMetric(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3;
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

export function TrainingFallback() {
  return (
    <div aria-hidden="true">
      <div className="border-b border-stone-200 pb-8 dark:border-stone-800">
        <div className="h-3 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        <div className="mt-4 h-10 w-56 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800"
          />
        ))}
      </div>
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
        <div className="h-80 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      </div>
    </div>
  );
}
