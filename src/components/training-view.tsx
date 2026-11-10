import type { PersonalBest } from "@/content/personal-bests";
import { formatDay } from "@/lib/garmin/format";
import type { TrainingSnapshot } from "@/lib/garmin/snapshot";

export function TrainingView({
  snapshot,
  bests,
}: {
  snapshot: TrainingSnapshot;
  bests: PersonalBest[];
}) {
  const maxKm = Math.max(...snapshot.days.map((day) => day.km), 0);

  return (
    <>
      <p className="mt-3 text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
        {snapshot.rangeLabel}
      </p>
      {snapshot.note ? (
        <p className="mt-6 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
          {snapshot.note}
        </p>
      ) : null}

      {snapshot.metrics.length > 0 ? (
        <section className="mt-10" aria-labelledby="metrics-heading">
          <h2
            id="metrics-heading"
            className="type-section text-[1.3125rem] leading-[1.2] text-stone-500 sm:text-[1.5rem] dark:text-stone-400"
          >
            Now
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {snapshot.metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-lg border border-stone-200 px-3 py-3 dark:border-stone-800"
              >
                <p className="text-sm font-medium leading-5 text-stone-500 dark:text-stone-400">
                  {metric.label}
                </p>
                <p className="type-metric mt-1 text-[1.875rem] leading-[1.1] sm:text-[2.125rem]">
                  <WithUnits text={metric.value} />
                </p>
                {metric.detail ? (
                  <p className="mt-1 text-[0.8125rem] font-normal leading-5 text-stone-500 dark:text-stone-400">
                    <WithUnits text={metric.detail} unitClassName="type-unit-inline" />
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="runs-heading"
            className="type-display text-[1.375rem] leading-[1.15] text-stone-500 sm:text-[1.625rem] dark:text-stone-400"
          >
            Runs
          </h2>
          <p className="type-figure text-[0.8125rem] text-stone-500 dark:text-stone-400">
            <WithUnits text={snapshot.totalsLabel} unitClassName="type-unit-inline" />
          </p>
        </div>
        <DistanceChart days={snapshot.days} maxKm={maxKm} />
        {snapshot.activities.length > 0 ? (
          <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-800">
            {snapshot.activities.map((activity) => (
              <li
                key={activity.id}
                className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
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
                  <p className="text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
                    {activity.dateLabel}
                    {activity.run ? "" : ` · ${activity.typeLabel}`}
                  </p>
                </div>
                <p className="type-figure text-[0.8125rem] text-stone-600 sm:text-sm dark:text-stone-300">
                  <StatLine
                    parts={[
                      activity.distanceLabel,
                      activity.timeLabel,
                      activity.paceLabel,
                      activity.heartRateLabel,
                    ]}
                  />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
            No runs in this window.
          </p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="bests-heading">
        <h2
          id="bests-heading"
          className="type-display text-[1.375rem] leading-[1.15] text-stone-500 sm:text-[1.625rem] dark:text-stone-400"
        >
          Personal bests
        </h2>
        {bests.length > 0 ? (
          <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-800">
            {bests.map((best) => (
              <li
                key={`${best.event}-${best.date}-${best.mark}`}
                className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
              >
                <div>
                  <p className="text-[0.9375rem] font-semibold leading-snug">{best.event}</p>
                  <p className="text-[0.8125rem] font-medium leading-5 text-stone-500 dark:text-stone-400">
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
          <p className="mt-4 text-sm font-normal leading-6 text-stone-600 dark:text-stone-400">
            None yet. Add one in{" "}
            <code className="text-code">src/content/personal-bests.ts</code>.
          </p>
        )}
      </section>
    </>
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
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${days.length * 12} 96`}
        className="h-24 w-full text-stone-800 dark:text-stone-200"
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

function StatLine({ parts }: { parts: (string | null)[] }) {
  const items = parts.filter((part): part is string => Boolean(part));
  return items.map((item, index) => (
    <span key={`${item}-${index}`}>
      {index > 0 ? " · " : null}
      <WithUnits text={item} unitClassName="type-unit-inline" />
    </span>
  ));
}

export function TrainingFallback() {
  return (
    <div className="mt-10 space-y-3" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="h-40 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}
