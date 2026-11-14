"use client";

import { useMemo, useState } from "react";
import type { ActivitySample } from "@/lib/garmin/activity-detail";
import { formatDuration } from "@/lib/garmin/format";

export function ActivityTraceChart({
  samples,
  read,
  formatY,
  axisLabel,
  unit,
  area = false,
  note,
  xValue,
  formatX = formatDuration,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  formatY: (value: number) => string;
  axisLabel: string;
  unit: string;
  area?: boolean;
  note: string;
  xValue?: (sample: ActivitySample) => number | null;
  formatX?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const height = 260;
  const padTop = 16;
  const padRight = 16;
  const padLeft = 48;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - 36;

  const plotted = useMemo(() => {
    const values = samples.flatMap((sample) => {
      const value = read(sample);
      return value === null ? [] : [value];
    });
    if (values.length < 2) return null;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padValue = (maxValue - minValue) * 0.08 || 1;
    const lo = minValue - padValue;
    const hi = maxValue + padValue;
    const xRead = xValue ?? ((sample: ActivitySample) => sample.elapsedSeconds);
    const xValues = samples.flatMap((sample) => {
      const value = xRead(sample);
      return value === null ? [] : [value];
    });
    const xStart = xValues[0] ?? 0;
    const xEnd = xValues[xValues.length - 1] ?? 0;
    const xSpan = xEnd - xStart || 1;
    const coords = samples.map((sample) => {
      const value = read(sample);
      const xRaw = xRead(sample);
      const x = xRaw === null ? null : padLeft + ((xRaw - xStart) / xSpan) * innerW;
      const y = value === null ? null : padTop + (1 - (value - lo) / (hi - lo)) * innerH;
      return { x, y, sample, value, xRaw };
    });
    return { lo, hi, coords };
  }, [samples, read, xValue, innerH, innerW]);

  if (!plotted) {
    return <p className="td-muted text-sm leading-6">Not enough samples for this chart.</p>;
  }

  const { lo, hi, coords } = plotted;
  const line = pathFrom(coords.map((coord) => ({ x: coord.x ?? 0, y: coord.x === null || coord.y === null ? null : coord.y })));
  const first = coords.find((coord) => coord.y !== null && coord.x !== null);
  const last = [...coords].reverse().find((coord) => coord.y !== null && coord.x !== null);
  const base = padTop + innerH;
  const areaPath =
    area && first && last && line
      ? `${line} L${last.x ?? 0} ${base} L${first.x ?? 0} ${base} Z`
      : null;
  const yTicks = [lo, (lo + hi) / 2, hi];
  const activeCoord = active !== null ? coords[active] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        role="img"
        aria-label={axisLabel}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const x = ratio * width;
          let nearest = 0;
          let best = Number.POSITIVE_INFINITY;
          coords.forEach((coord, index) => {
            if (coord.y === null || coord.x === null) return;
            const distance = Math.abs(coord.x - x);
            if (distance < best) {
              best = distance;
              nearest = index;
            }
          });
          setActive(nearest);
        }}
      >
        <text x={padLeft} y={12} className="td-history-axis">
          {unit}
        </text>
        {yTicks.map((tick) => {
          const y = padTop + (1 - (tick - lo) / (hi - lo)) * innerH;
          return (
            <g key={tick}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="td-history-grid" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="td-history-axis">
                {formatY(tick)}
              </text>
            </g>
          );
        })}
        {areaPath ? <path d={areaPath} className="td-history-area" /> : null}
        <path d={line} className="td-history-line" fill="none" />
        {activeCoord?.y !== null && activeCoord?.x !== null && activeCoord ? (
          <line
            x1={activeCoord.x}
            x2={activeCoord.x}
            y1={padTop}
            y2={base}
            className="td-history-grid"
          />
        ) : null}
        <text x={padLeft} y={height - 12} className="td-history-axis">
          {formatX(coords.find((coord) => coord.xRaw !== null)?.xRaw ?? 0)}
        </text>
        <text x={width - padRight} y={height - 12} textAnchor="end" className="td-history-axis">
          {formatX([...coords].reverse().find((coord) => coord.xRaw !== null)?.xRaw ?? 0)}
        </text>
      </svg>
      <p className="td-muted mt-2 text-xs leading-5">{note}</p>
      <p className="td-history-tooltip type-figure">
        {activeCoord?.value !== null && activeCoord?.value !== undefined
          ? `${formatX(activeCoord.xRaw ?? 0)} · ${formatY(activeCoord.value)} ${unit}`
          : "Hover the line for an exact reading."}
      </p>
    </div>
  );
}

export function ActivitySparkline({
  samples,
  read,
  label,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  label: string;
}) {
  const values = samples.flatMap((sample) => {
    const value = read(sample);
    return value === null ? [] : [value];
  });
  if (values.length < 8) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const end = samples[samples.length - 1]?.elapsedSeconds || 1;
  const width = 320;
  const height = 72;
  const path = sparklinePath(samples, read, min, span, end, width, height);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="td-run-sparkline" role="img" aria-label={label}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function sparklinePath(
  samples: ActivitySample[],
  read: (sample: ActivitySample) => number | null,
  min: number,
  span: number,
  end: number,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  let drawing = false;
  for (const sample of samples) {
    const value = read(sample);
    if (value === null) {
      drawing = false;
      continue;
    }
    const x = (sample.elapsedSeconds / end) * width;
    const y = height - ((value - min) / span) * (height - 8) - 4;
    parts.push(`${drawing ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    drawing = true;
  }
  return parts.join(" ");
}

function pathFrom(coords: { x: number; y: number | null }[]): string {
  let path = "";
  let drawing = false;
  for (const coord of coords) {
    if (coord.y === null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)} `;
    drawing = true;
  }
  return path.trim();
}
