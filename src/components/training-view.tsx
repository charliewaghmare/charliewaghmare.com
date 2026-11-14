import Link from "next/link";
import { DistanceChart } from "@/components/distance-chart";
import { LatestRunPanel } from "@/components/latest-run-panel";
import { MetricExplorer } from "@/components/metric-explorer";
import type { PersonalBest } from "@/content/personal-bests";
import { site } from "@/content/site";
import { formatDay } from "@/lib/garmin/format";
import type { TrainingSnapshot } from "@/lib/garmin/snapshot";

const PRIMARY_IDS = ["status", "load", "vo2", "hrv", "readiness"];
const SECONDARY_IDS = ["balance", "rhr", "sleep"];

export function TrainingView({
  snapshot,
  bests,
}: {
  snapshot: TrainingSnapshot;
  bests: PersonalBest[];
}) {
  const maxKm = Math.max(...snapshot.days.map((day) => day.km), 0);
  const latestRun = snapshot.latestActivity;
  const dashboardMetrics =
    snapshot.dashboardMetrics.length > 0
      ? snapshot.dashboardMetrics
      : [];

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

      {dashboardMetrics.length > 0 ? (
        <MetricExplorer
          metrics={dashboardMetrics}
          primaryIds={PRIMARY_IDS}
          secondaryIds={SECONDARY_IDS}
          featuredSlot={
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
          }
        />
      ) : (
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
      )}

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
