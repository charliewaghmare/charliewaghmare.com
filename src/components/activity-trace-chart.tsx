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
  invertY = false,
  maxY,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  formatY: (value: number) => string;
  axisLabel: string;
  unit: string;
  area?: boolean;
  note: string;
  elapsedSeconds?: number | null;
  invertY?: boolean;
  maxY?: number;
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
    const maxValue = maxY ?? Math.max(...values);
    const minValue = Math.min(maxValue, ...values);
    const padValue = (maxValue - minValue) * 0.08 || 1;
    const lo = minValue - (maxY === undefined ? padValue : Math.max(padValue, 2));
    const hi = maxY ?? maxValue + padValue;
    const xStart = 0;
    const xEnd = Math.max(elapsedSeconds ?? 0, ...samples.map((sample) => sample.elapsedSeconds));
    const xSpan = xEnd - xStart || 1;
    const coords = samples.map((sample) => {
      const value = read(sample);
      const xRaw = sample.elapsedSeconds;
      const x = padLeft + ((xRaw - xStart) / xSpan) * innerW;
      const y = value === null ? null : padTop + verticalPosition(value, lo, hi, invertY) * innerH;
      return { x, y, sample, value, xRaw };
    });
    return { lo, hi, coords, xStart, xEnd };
  }, [samples, read, elapsedSeconds, innerH, innerW, invertY, maxY]);

  if (!plotted) {
    return <p className="td-muted text-sm leading-6">Not enough samples for this chart.</p>;
  }

  const { lo, hi, coords, xStart, xEnd } = plotted;
  const line = pathFrom(coords);
  const base = padTop + innerH;
  const areaPath = area ? areaPathFrom(coords, base) : null;
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
          const y = padTop + verticalPosition(tick, lo, hi, invertY) * innerH;
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
  invertY = false,
  maxY,
  area = false,
}: {
  samples: ActivitySample[];
  read: (sample: ActivitySample) => number | null;
  label: string;
  elapsedSeconds?: number | null;
  invertY?: boolean;
  maxY?: number;
  area?: boolean;
}) {
  const values = samples.flatMap((sample) => {
    const value = read(sample);
    return value === null ? [] : [value];
  });
  if (values.length < 8) return null;
  const min = Math.min(...values, maxY === undefined ? Infinity : maxY - 1);
  const max = maxY ?? Math.max(...values);
  const end = Math.max(elapsedSeconds ?? 0, ...samples.map((sample) => sample.elapsedSeconds)) || 1;
  const width = 320;
  const height = 72;
  const coords = samples.map((sample) => {
    const value = read(sample);
    return {
      x: sample.elapsedSeconds / end * width,
      y: value === null ? null : 4 + verticalPosition(value, min, max, invertY) * (height - 8),
    };
  });
  const path = pathFrom(coords);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="td-run-sparkline" role="img" aria-label={label}>
      {area ? <path d={areaPathFrom(coords, height - 4)} className="td-history-area" /> : null}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function verticalPosition(value: number, min: number, max: number, invert: boolean): number {
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  return invert ? fraction : 1 - fraction;
}

function areaPathFrom(coords: { x: number; y: number | null }[], base: number): string {
  const parts: string[] = [];
  let segment: typeof coords = [];
  const closeSegment = () => {
    if (segment.length === 0) return;
    const first = segment[0];
    const last = segment[segment.length - 1];
    parts.push(`${pathFrom(segment)} L${last.x.toFixed(1)} ${base} L${first.x.toFixed(1)} ${base} Z`);
    segment = [];
  };
  for (const coord of coords) {
    if (coord.y === null) closeSegment();
    else segment.push(coord);
  }
  closeSegment();
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
