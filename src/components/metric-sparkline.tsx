import { historyPosition, historyGap, type HistoryPoint } from "@/lib/garmin/series";

export function MetricSparkline({
  points,
  className,
  continuous = false,
}: {
  points: HistoryPoint[];
  className?: string;
  continuous?: boolean;
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
  const path = points
    .map((point, index) => {
      const x = historyPosition(points, point.iso) * width;
      const y = height - ((point.value - min) / span) * (height - 4) - 2;
      const gap = index > 0 && !continuous && historyGap(points[index - 1].iso, point.iso);
      return `${index === 0 || gap ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
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
