import Link from "next/link";
import { DistanceChart } from "@/components/distance-chart";
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
      <header className="td-divider border-b pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="td-overline">
              <Link href="/" className="td-link">
                {site.name}
              </Link>
              <span aria-hidden="true"> / </span>
              <span>Training</span>
            </p>
            <h1 className="type-display td-text mt-3 text-[2.125rem] leading-[1.1] sm:text-[3rem]">
              Training
            </h1>
            <p className="td-muted mt-3 max-w-xl text-sm font-normal leading-6">
              A live look at the numbers behind the miles.
            </p>
          </div>
          <div className="shrink-0 text-left lg:text-right">
            <p className="td-label text-[0.6875rem] font-medium uppercase tracking-[0.12em]">
              Last 30 days
            </p>
            <p className="type-figure td-muted mt-1 text-[0.8125rem]">
              {snapshot.rangeLabel}
            </p>
          </div>
        </div>
        {snapshot.note ? (
          <p className="td-muted mt-6 max-w-2xl text-sm font-normal leading-6">
            {snapshot.note}
          </p>
        ) : null}
      </header>

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
            className="type-section td-text text-[1.125rem] leading-tight sm:text-[1.25rem]"
          >
            Recovery and targets
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {secondary.map((metric) => (
              <MetricCard
                key={metric.label}
                metric={metric}
                className={
                  SECONDARY_WIDE.has(metric.label) ? "col-span-2" : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="td-divider mt-14 border-t pt-10" aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="runs-heading"
            className="type-display td-text text-[1.375rem] leading-[1.15] sm:text-[1.625rem]"
          >
            Runs
          </h2>
          {snapshot.activities.length > 0 ? (
            <div className="td-label hidden grid-cols-4 gap-4 text-[0.6875rem] font-medium uppercase tracking-[0.08em] sm:grid sm:w-[min(100%,28rem)] sm:text-right">
              <span>Distance</span>
              <span>Duration</span>
              <span>Pace</span>
              <span>Avg HR</span>
            </div>
          ) : null}
        </div>
        {snapshot.activities.length > 0 ? (
          <ul className="mt-4 divide-y divide-[var(--td-border-subtle)]">
            {snapshot.activities.map((activity) => (
              <li
                key={activity.id}
                className="td-activity-row -mx-2 grid gap-2 rounded-lg px-2 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,28rem)] sm:items-baseline sm:gap-8"
              >
                <div className="min-w-0">
                  {activity.href ? (
                    <a
                      href={activity.href}
                      target="_blank"
                      rel="noreferrer"
                      className="td-activity-link text-[0.9375rem] font-semibold leading-snug"
                    >
                      {activity.name}
                    </a>
                  ) : (
                    <p className="td-text text-[0.9375rem] font-semibold leading-snug">
                      {activity.name}
                    </p>
                  )}
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="td-muted mt-6 text-sm font-normal leading-6">
            No runs in this window.
          </p>
        )}
      </section>

      <section className="td-divider mt-14 border-t pt-10" aria-labelledby="bests-heading">
        <h2
          id="bests-heading"
          className="type-display td-text text-[1.375rem] leading-[1.15] sm:text-[1.625rem]"
        >
          Personal bests
        </h2>
        {bests.length > 0 ? (
          <ul className="mt-6 divide-y divide-[var(--td-border-subtle)]">
            {bests.map((best) => (
              <li
                key={`${best.event}-${best.date}-${best.mark}`}
                className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
              >
                <div>
                  <p className="td-text text-[0.9375rem] font-semibold leading-snug">
                    {best.event}
                  </p>
                  <p className="td-muted mt-1 text-[0.8125rem] font-medium leading-5">
                    {best.date ? formatBestDate(best.date) : "Date not set"}
                    {best.note ? ` · ${best.note}` : ""}
                  </p>
                </div>
                <p className="type-figure td-text text-[0.9375rem] font-medium">
                  <WithUnits text={best.mark} unitClassName="type-unit-inline" />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="td-muted mt-6 text-sm font-normal leading-6">
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
        "td-card flex min-h-[7.25rem] flex-col px-4 py-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="td-label text-[0.8125rem] font-medium leading-5">{metric.label}</p>
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
        <p className="td-muted mt-2 text-[0.8125rem] font-normal leading-5">
          <WithUnits text={metric.detail} unitClassName="type-unit-inline" />
        </p>
      ) : (
        <p className="mt-2 text-[0.8125rem] leading-5 text-transparent" aria-hidden="true">
          —
        </p>
      )}
      <div
        className="td-divider mt-auto min-h-7 border-t border-dashed pt-3"
        aria-hidden="true"
      />
    </article>
  );
}

function LatestRunPanel({ activity }: { activity: ActivityRow | null }) {
  return (
    <article className="td-card flex min-h-[20rem] flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="td-overline tracking-[0.12em]">Latest run</p>
          {activity ? (
            <>
              <h3 className="type-display td-text mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
                {activity.name}
              </h3>
              <p className="td-muted mt-2 text-[0.8125rem] font-medium leading-5">
                {activity.dateLabel}
              </p>
            </>
          ) : (
            <h3 className="type-display td-text mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
              No recent run
            </h3>
          )}
        </div>
        {activity?.href ? (
          <a
            href={activity.href}
            target="_blank"
            rel="noreferrer"
            className="td-link text-[0.8125rem] font-medium underline"
          >
            View on Garmin ↗
          </a>
        ) : null}
      </div>

      {activity ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6">
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
            <FeaturedStat label="Duration" value={activity.timeLabel} />
            <FeaturedStat label="Avg HR" value={activity.heartRateLabel} />
            <FeaturedStat label="Type" value={activity.typeLabel} />
          </dl>
          <div
            className="td-divider mt-auto min-h-20 border-t border-dashed pt-4"
            aria-hidden="true"
          />
        </>
      ) : (
        <p className="td-muted mt-8 text-sm font-normal leading-6">
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
    <article className="td-card flex min-h-[20rem] flex-col p-5 sm:p-6">
      <p className="td-overline tracking-[0.12em]">Training overview</p>
      <h3 className="type-display td-text mt-2 text-[1.5rem] leading-[1.15] sm:text-[1.75rem]">
        Last 30 days
      </h3>
      <p className="type-figure td-muted mt-3 text-sm">
        <WithUnits text={totalsLabel} unitClassName="type-unit-inline" />
      </p>
      <div className="mt-6 flex-1">
        <DistanceChart days={days} maxKm={maxKm} />
      </div>
    </article>
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

function ActivityStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="td-label text-[0.6875rem] font-medium uppercase tracking-[0.08em] sm:sr-only">
        {label}
      </dt>
      <dd className="type-figure td-text mt-1 text-[0.8125rem] sm:mt-0 sm:text-sm">
        <WithUnits text={value ?? "—"} unitClassName="type-unit-inline" />
      </dd>
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
      <div className="td-divider border-b pb-8">
        <div className="td-skeleton h-3 w-48 animate-pulse rounded" />
        <div className="td-skeleton mt-4 h-10 w-56 animate-pulse rounded" />
        <div className="td-skeleton mt-3 h-4 w-80 max-w-full animate-pulse rounded" />
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="td-skeleton h-28 animate-pulse rounded-[0.75rem]" />
        ))}
      </div>
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="td-skeleton h-80 animate-pulse rounded-[0.75rem]" />
        <div className="td-skeleton h-80 animate-pulse rounded-[0.75rem]" />
      </div>
    </div>
  );
}
