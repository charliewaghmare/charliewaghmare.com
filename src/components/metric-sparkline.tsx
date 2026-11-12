import type { HistoryPoint } from "@/lib/garmin/series";

export function MetricSparkline({
  points,
  className,
}: {
  points: HistoryPoint[];
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <div
        className={["td-sparkline td-sparkline-empty", className]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      />
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 120;
  const height = 28;
  const step = width / (points.length - 1);
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={["td-sparkline", className].filter(Boolean).join(" ")}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
