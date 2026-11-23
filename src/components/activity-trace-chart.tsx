"use client";

import { useMemo } from "react";
import { ChartScrubber } from "@/components/chart-scrubber";
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
  elapsedSeconds,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  formatY: (value: number) => string;
  axisLabel: string;
  unit: string;
  area?: boolean;
  note: string;
  elapsedSeconds?: number | null;
}) {
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
    const xStart = 0;
    const xEnd = Math.max(elapsedSeconds ?? 0, ...samples.map((sample) => sample.elapsedSeconds));
    const xSpan = xEnd - xStart || 1;
    const coords = samples.map((sample) => {
      const value = read(sample);
      const xRaw = sample.elapsedSeconds;
      const x = padLeft + ((xRaw - xStart) / xSpan) * innerW;
      const y = value === null ? null : padTop + (1 - (value - lo) / (hi - lo)) * innerH;
      return { x, y, sample, value, xRaw };
    });
    return { lo, hi, coords, xStart, xEnd };
  }, [samples, read, elapsedSeconds, innerH, innerW]);

  if (!plotted) {
    return <p className="td-muted text-sm leading-6">Not enough samples for this chart.</p>;
  }

  const { lo, hi, coords, xStart, xEnd } = plotted;
  const line = pathFrom(coords);
  const first = coords.find((coord) => coord.y !== null);
  const last = [...coords].reverse().find((coord) => coord.y !== null);
  const base = padTop + innerH;
  const areaPath =
    area && first && last && line
      ? `${line} L${last.x} ${base} L${first.x} ${base} Z`
      : null;
  const yTicks = [lo, (lo + hi) / 2, hi];

  return (
    <div>
      <ChartScrubber
        points={coords.flatMap((coord, index) =>
          coord.y === null || coord.value === null ? [] : [{
            id: String(index),
            x: coord.x,
            y: coord.y,
            valueLabel: `${formatY(coord.value)} ${unit}`,
            label: `${formatDuration(coord.xRaw)} · ${formatY(coord.value)} ${unit}`,
          }],
        )}
        width={width}
        height={height}
        plotTop={padTop}
        plotBottom={base}
        label={axisLabel}
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
        <text x={padLeft} y={height - 12} className="td-history-axis">
          {formatDuration(xStart)}
        </text>
        <text x={width - padRight} y={height - 12} textAnchor="end" className="td-history-axis">
          {formatDuration(xEnd)}
        </text>
      </ChartScrubber>
      <p className="td-muted mt-2 text-xs leading-5">{note}</p>
    </div>
  );
}

export function ActivitySparkline({
  samples,
  read,
  label,
  elapsedSeconds,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  label: string;
  elapsedSeconds?: number | null;
}) {
  const values = samples.flatMap((sample) => {
    const value = read(sample);
    return value === null ? [] : [value];
  });
  if (values.length < 8) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const end = Math.max(elapsedSeconds ?? 0, ...samples.map((sample) => sample.elapsedSeconds)) || 1;
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
