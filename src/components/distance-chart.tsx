"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { formatDay } from "@/lib/garmin/format";
import type { TrainingSnapshot } from "@/lib/garmin/snapshot";

const SLOT = 12;
const BAR_WIDTH = 8;
const BAR_OFFSET = 2;
const VIEW_H = 96;
const BASELINE = 90;
const BAR_MAX_H = 84;
const ACCENT = "#50b8ff";
const HIGHLIGHT = "#8bd7ff";

function slotCenterPct(index: number, chartW: number): number {
  return ((index * SLOT + BAR_OFFSET + BAR_WIDTH / 2) / chartW) * 100;
}

function clampTipLeft(centerPct: number, tipWidthPct: number): number {
  const halfTip = tipWidthPct / 2;
  return Math.min(100 - halfTip, Math.max(halfTip, centerPct));
}

export function DistanceChart({
  days,
  maxKm,
}: {
  days: TrainingSnapshot["days"];
  maxKm: number;
}) {
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const [label, setLabel] = useState("");
  const [canHover, setCanHover] = useState(false);
  const peak = maxKm > 0 ? maxKm : 1;
  const chartW = Math.max(days.length * SLOT, SLOT);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const leaveChart = useCallback(() => setCursorIndex(null), []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!canHover || days.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      const index = Math.min(
        days.length - 1,
        Math.max(0, Math.floor(ratio * days.length)),
      );
      setCursorIndex(index);
      setLastIndex(index);
      const day = days[index];
      if (day && day.km > 0) {
        setLabel(`${day.km.toFixed(1)} km`);
      }
    },
    [canHover, days],
  );

  const indexForPos = cursorIndex ?? lastIndex;
  const onRunDay =
    cursorIndex !== null && (days[cursorIndex]?.km ?? 0) > 0;
  const centerPct = slotCenterPct(indexForPos, chartW);
  const tipWidthPct = ((3 * SLOT) / chartW) * 100;
  const tipLeft = clampTipLeft(centerPct, tipWidthPct);
  const belowBaselinePct = ((VIEW_H - BASELINE) / VIEW_H) * 100;
  const highlightIndex = onRunDay ? cursorIndex : null;

  return (
    <div className="td-distance-chart" onPointerLeave={leaveChart}>
      <div className="td-distance-chart-stage">
        <div
          className={["td-distance-tooltip", onRunDay ? "is-active" : ""]
            .filter(Boolean)
            .join(" ")}
          style={{ left: `${tipLeft}%`, width: `${tipWidthPct}%` }}
          aria-hidden="true"
        >
          {label || "\u00a0"}
        </div>
        <div className="td-distance-chart-plot">
          <div
            className={["td-distance-guide", onRunDay ? "is-active" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${centerPct}%`,
              top: 0,
              bottom: `${belowBaselinePct}%`,
            }}
            aria-hidden="true"
          />
          <svg
            viewBox={`0 0 ${chartW} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="td-chart h-36 w-full sm:h-44"
            role="img"
            aria-label="Run distance over the last 30 days"
            onPointerMove={canHover ? onPointerMove : undefined}
            onPointerLeave={canHover ? leaveChart : undefined}
          >
            {days.map((day, index) => {
              const hasRun = day.km > 0;
              const height = hasRun
                ? Math.max(4, (day.km / peak) * BAR_MAX_H)
                : 2;
              const y = BASELINE - height;
              const isActive = highlightIndex === index;
              return (
                <rect
                  key={day.iso}
                  x={index * SLOT + BAR_OFFSET}
                  y={y}
                  width={BAR_WIDTH}
                  height={height}
                  rx="1.5"
                  fill={
                    hasRun ? (isActive ? HIGHLIGHT : ACCENT) : "currentColor"
                  }
                  opacity={hasRun ? 1 : 0.22}
                  className={
                    hasRun ? "td-distance-bar" : "td-distance-bar-empty"
                  }
                />
              );
            })}
          </svg>
        </div>
      </div>
      <div className="type-figure td-muted mt-1 flex justify-between text-xs">
        <span>{days[0] ? formatDay(days[0].iso, false) : ""}</span>
        <span>
          {days.length > 0 ? formatDay(days[days.length - 1].iso, false) : ""}
        </span>
      </div>
    </div>
  );
}
