"use client";

import { useMemo, useState } from "react";
import { historyPosition, historyGap, type CategoryPoint, type HistoryPoint } from "@/lib/garmin/series";
import { formatDay } from "@/lib/garmin/format";

export function MetricHistoryChart({
  points,
  unit,
  label = "Historical metric chart",
  continuous = false,
}: {
  points: HistoryPoint[];
  unit?: string;
  label?: string;
  continuous?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const width = 640;
  const height = 260;
  const padTop = 16;
  const padRight = 16;
  const padLeft = 44;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - 36;

  const { min, max, coords, path } = useMemo(() => {
    const values = points.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padValue = (maxValue - minValue) * 0.08 || 1;
    const lo = minValue - padValue;
    const hi = maxValue + padValue;
    const mapped = points.map((point) => {
      const x =
        points.length === 1
          ? padLeft + innerW / 2
          : padLeft + historyPosition(points, point.iso) * innerW;
      const y = padTop + (1 - (point.value - lo) / (hi - lo)) * innerH;
      return { x, y, point };
    });

    const segments: string[] = [];
    mapped.forEach((coord, index) => {
      if (index === 0) {
        segments.push(`M${coord.x} ${coord.y}`);
        return;
      }
      const previous = points[index - 1];
      if (!continuous && historyGap(previous.iso, coord.point.iso)) {
        segments.push(`M${coord.x} ${coord.y}`);
      } else {
        segments.push(`L${coord.x} ${coord.y}`);
      }
    });

    return {
      min: lo,
      max: hi,
      coords: mapped,
      path: segments.join(" "),
    };
  }, [points, innerH, innerW, continuous]);

  if (points.length === 0) {
    return (
      <p className="td-muted text-sm leading-6">
        No recorded values in this range.
      </p>
    );
  }

  const yTicks = [min, (min + max) / 2, max];
  const activeCoord = coords.find((coord) => coord.point.iso === active);

  return (
    <div className="td-history-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        role="img"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        {yTicks.map((tick) => {
          const y = padTop + (1 - (tick - min) / (max - min)) * innerH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                className="td-history-grid"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="td-history-axis"
              >
                {formatTick(tick, unit)}
              </text>
            </g>
          );
        })}
        <path d={path} className="td-history-line" fill="none" />
        {coords.map((coord) => (
          <circle
            key={coord.point.iso}
            cx={coord.x}
            cy={coord.y}
            r={active === coord.point.iso ? 4 : 2.5}
            className="td-history-point"
            onPointerEnter={() => setActive(coord.point.iso)}
            onPointerDown={() => setActive(coord.point.iso)}
            tabIndex={0}
            role="button"
            aria-label={`${formatDay(coord.point.iso)}: ${formatReading(coord.point.value, unit)}`}
            onFocus={() => setActive(coord.point.iso)}
          />
        ))}
        {coords.map((coord, index) => (
          <rect
            key={`hit-${coord.point.iso}`}
            x={index === 0 ? padLeft : (coords[index - 1].x + coord.x) / 2}
            y={padTop}
            width={(index === coords.length - 1 ? width - padRight : (coord.x + coords[index + 1].x) / 2) - (index === 0 ? padLeft : (coords[index - 1].x + coord.x) / 2)}
            height={innerH}
            fill="transparent"
            onPointerEnter={() => setActive(coord.point.iso)}
          />
        ))}
        <text x={padLeft} y={height - 12} className="td-history-axis">
          {formatDay(points[0].iso, false)}
        </text>
        <text
          x={width - padRight}
          y={height - 12}
          textAnchor="end"
          className="td-history-axis"
        >
          {formatDay(points[points.length - 1].iso, false)}
        </text>
      </svg>
      {activeCoord ? (
        <p className="td-history-tooltip type-figure">
          {formatDay(activeCoord.point.iso)} ·{" "}
          {formatReading(activeCoord.point.value, unit)}
        </p>
      ) : (
        <p className="td-muted text-[0.8125rem]">
          {unit ? `${unit}. ` : ""}
          Hover a point for the exact reading.
        </p>
      )}
    </div>
  );
}

export function CategoryHistoryList({ points }: { points: CategoryPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="td-muted text-sm leading-6">
        No recorded status changes in this range.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--td-border-subtle)]">
      {[...points].reverse().map((point) => (
        <li
          key={`${point.iso}-${point.value}`}
          className="flex items-baseline justify-between gap-4 py-3"
        >
          <p className="td-text text-sm font-medium">{point.value}</p>
          <p className="type-figure td-muted text-[0.8125rem]">
            {formatDay(point.iso)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function formatTick(value: number, unit?: string): string {
  const rounded =
    Math.abs(value) >= 100
      ? String(Math.round(value))
      : value.toFixed(1).replace(/\.0$/, "");
  return unit && unit.length <= 5 ? `${rounded} ${unit}` : rounded;
}

function formatReading(value: number, unit?: string): string {
  const rounded = formatTick(value);
  return unit ? `${rounded} ${unit}` : rounded;
}
