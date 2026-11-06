import type { Point } from "@/lib/garmin/polyline";

export function RouteMap({
  points,
  className,
}: {
  points: Point[];
  className?: string;
}) {
  const path = tracePath(points);
  if (!path) return null;

  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function tracePath(points: Point[]): string | null {
  if (points.length < 2) return null;
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const xScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * xScale, 0.00001);
  const spanY = Math.max(maxLat - minLat, 0.00001);
  const width = 320;
  const height = 180;
  const pad = 14;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const originX = (width - usedW) / 2;
  const originY = (height - usedH) / 2;

  return points
    .map((point, index) => {
      const x = originX + (point.lon - minLon) * xScale * scale;
      const y = originY + (maxLat - point.lat) * scale;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
