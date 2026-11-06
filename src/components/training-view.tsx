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
      <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
        {snapshot.rangeLabel}
      </p>
      {snapshot.note ? (
        <p className="mt-6 text-sm leading-6 text-stone-600 dark:text-stone-400">
          {snapshot.note}
        </p>
      ) : null}

      {snapshot.metrics.length > 0 ? (
        <section className="mt-10" aria-labelledby="metrics-heading">
          <h2
            id="metrics-heading"
            className="text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            Now
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {snapshot.metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-lg border border-stone-200 px-3 py-3 dark:border-stone-800"
              >
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {metric.label}
                </p>
                <p className="mt-1 text-lg font-medium tracking-tight tabular-nums">
                  {metric.value}
                </p>
                {metric.detail ? (
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    {metric.detail}
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
            className="text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            Runs
          </h2>
          <p className="text-sm tabular-nums text-stone-500 dark:text-stone-400">
            {snapshot.totalsLabel}
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
                      className="font-medium underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500 dark:decoration-stone-700"
                    >
                      {activity.name}
                    </a>
                  ) : (
                    <p className="font-medium">{activity.name}</p>
                  )}
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {activity.dateLabel}
                    {activity.run ? "" : ` · ${activity.typeLabel}`}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-stone-600 dark:text-stone-300">
                  {[
                    activity.distanceLabel,
                    activity.timeLabel,
                    activity.paceLabel,
                    activity.heartRateLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
            No activities in this window.
          </p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="bests-heading">
        <h2
          id="bests-heading"
          className="text-sm font-medium text-stone-500 dark:text-stone-400"
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
                  <p className="font-medium">{best.event}</p>
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {best.date ? formatBestDate(best.date) : "Date not set"}
                    {best.note ? ` · ${best.note}` : ""}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">{best.mark}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
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
      <div className="mt-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
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

export function TrainingFallback() {
  return (
    <div className="mt-10 space-y-3" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="h-40 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}
