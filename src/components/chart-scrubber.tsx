"use client";

import { useState, type PointerEvent, type ReactNode } from "react";

type ChartPoint = {
  id: string;
  x: number;
  y: number;
  valueLabel: string;
  label: string;
};

export function ChartScrubber({
  points,
  width,
  height,
  plotTop,
  plotBottom,
  label,
  children,
}: {
  points: ChartPoint[];
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  label: string;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<{ id: string | null; visible: boolean }>({
    id: null,
    visible: false,
  });
  const selected = points.find((point) => point.id === selection.id);
  const active = selection.visible ? selected : undefined;
  const leaveChart = () => setSelection((previous) => ({ ...previous, visible: false }));
  const selectPoint = (point: ChartPoint) => setSelection({ id: point.id, visible: true });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || points.length === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const nearest = points.reduce((best, point) =>
      Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best,
    );
    selectPoint(nearest);
  };

  return (
    <div className="td-chart-scrubber" onPointerLeave={leaveChart}>
      <div className="td-distance-chart-stage">
        <div
          className={`td-distance-tooltip${active ? " is-active" : ""}`}
          style={{ left: `clamp(min(5rem, 50%), ${((selected?.x ?? width / 2) / width) * 100}%, max(50%, calc(100% - 5rem)))` }}
          aria-hidden="true"
        >
          {selected?.valueLabel ?? "\u00a0"}
        </div>
        <div className="td-distance-chart-plot">
          <div
            className={`td-distance-guide${active ? " is-active" : ""}`}
            style={{
              left: `${((selected?.x ?? width / 2) / width) * 100}%`,
              top: `${(plotTop / height) * 100}%`,
              bottom: `${((height - plotBottom) / height) * 100}%`,
            }}
            aria-hidden="true"
          />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="td-chart block h-auto w-full"
            role="group"
            aria-label={active ? `${label}: ${active.label}` : `${label}. Use arrow keys to inspect readings.`}
            tabIndex={0}
            onBlur={leaveChart}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch" || event.buttons > 0) onPointerMove(event);
            }}
            onPointerDown={onPointerMove}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
              // Let Escape reach the containing modal so it still closes normally.
              if (event.key === "Escape") { leaveChart(); return; }
              event.preventDefault();
              const index = active ? points.indexOf(active) : -1;
              const nextIndex = event.key === "Home" ? 0
                : event.key === "End" ? points.length - 1
                : index < 0 ? (event.key === "ArrowLeft" ? points.length - 1 : 0)
                : Math.max(0, Math.min(points.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
              const next = points[nextIndex];
              if (next) selectPoint(next);
            }}
          >
            {children}
            {active ? (
              <circle cx={active.x} cy={active.y} r={4} className="td-history-active-point" />
            ) : null}
          </svg>
        </div>
      </div>
      <p className="td-history-tooltip type-figure">
        {active?.label ?? "Hover, tap, or use arrow keys for an exact reading."}
      </p>
    </div>
  );
}
