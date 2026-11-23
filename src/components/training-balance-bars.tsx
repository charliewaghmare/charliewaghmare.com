import type { TrainingBalance } from "@/lib/garmin/extract";

const BANDS = [
  { id: "low", label: "Low aerobic", color: "var(--td-balance-low)" },
  { id: "high", label: "High aerobic", color: "var(--td-balance-high)" },
  { id: "anaerobic", label: "Anaerobic", color: "var(--td-balance-anaerobic)" },
] as const;

export function TrainingBalanceBars({
  balance,
  detailed = false,
}: {
  balance?: TrainingBalance;
  detailed?: boolean;
}) {
  if (!balance || BANDS.every((band) => balance[band.id] === null)) {
    return (
      <p className="td-muted text-sm leading-6">
        Training balance data is unavailable.
      </p>
    );
  }

  const scale =
    Math.max(
      1,
      ...BANDS.flatMap(({ id }) => [
        balance[id] ?? 0,
        balance.optimal[id]?.max ?? 0,
      ])
    ) * 1.1;
  const hasRange = BANDS.some(({ id }) => balance.optimal[id] !== null);

  return (
    <div className="w-full">
      <div className={detailed ? "space-y-6" : "space-y-3"}>
        {BANDS.map(({ id, label, color }) => {
          const load = balance[id];
          const range = balance.optimal[id];
          const value = load === null ? "—" : String(Math.round(load));
          const target = range
            ? `${Math.round(range.min)}–${Math.round(range.max)}`
            : null;
          return (
            <div key={id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <p className="td-text">{label}</p>
                <p className="type-figure td-text">{value}</p>
              </div>
              <div
                className="td-balance-track"
                role="img"
                aria-label={`${label}: ${
                  load === null ? "load unavailable" : `load ${value}`
                }. ${
                  target
                    ? `Garmin optimal range ${target}.`
                    : "Optimal range unavailable."
                }`}
              >
                {load !== null ? (
                  <div
                    className="td-balance-fill"
                    style={{
                      width: `${(load / scale) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                ) : null}
                {range ? (
                  <div
                    className="td-balance-range"
                    style={{
                      left: `${(range.min / scale) * 100}%`,
                      width: `${((range.max - range.min) / scale) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              {detailed ? (
                <p className="td-muted mt-1 text-xs leading-5">
                  {target ? `Optimal ${target}` : "Optimal range unavailable"}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="td-muted mt-3 flex items-center gap-2 text-xs leading-5">
        {hasRange ? (
          <>
            <span className="td-balance-legend" aria-hidden="true" />
            Optimal range
          </>
        ) : (
          "Optimal ranges unavailable"
        )}
      </p>
    </div>
  );
}
