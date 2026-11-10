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

export function DistanceChart({
  days,
  maxKm,
}: {
  days: TrainingSnapshot["days"];
  maxKm: number;
}) {
  const [active, setActive] = useState<number | null>(null);
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

  const clear = useCallback(() => setActive(null), []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!canHover) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      const index = Math.min(
        days.length - 1,
        Math.max(0, Math.floor(ratio * days.length)),
      );
      const day = days[index];
      if (day && day.km > 0) setActive(index);
      else setActive(null);
    },
    [canHover, days],
  );

  const activeDay = active !== null ? days[active] : null;
  const showHover = active !== null && activeDay !== null && activeDay.km > 0;
  const centerPct = showHover
    ? ((active * SLOT + BAR_OFFSET + BAR_WIDTH / 2) / chartW) * 100
    : 0;
  const tipWidthPct = ((3 * SLOT) / chartW) * 100;
  const halfTip = tipWidthPct / 2;
  const tipLeft = showHover
    ? Math.min(100 - halfTip, Math.max(halfTip, centerPct))
    : halfTip;
  const baselinePct = (BASELINE / VIEW_H) * 100;

  return (
    <div className="td-distance-chart" onPointerLeave={clear}>
      <div className="td-distance-chart-stage">
        <div
          className={["td-distance-tooltip", showHover ? "is-active" : ""]
            .filter(Boolean)
            .join(" ")}
          style={{ left: `${tipLeft}%`, width: `${tipWidthPct}%` }}
          aria-hidden="true"
        >
          {showHover ? `${activeDay.km.toFixed(1)} km` : "\u00a0"}
        </div>
        <div className="td-distance-chart-plot">
          <div
            className={["td-distance-guide", showHover ? "is-active" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${centerPct}%`, height: `${baselinePct}%` }}
            aria-hidden="true"
          />
          <svg
            viewBox={`0 0 ${chartW} ${VIEW_H}`}
            className="td-chart h-36 w-full sm:h-44"
            role="img"
            aria-label="Run distance over the last 30 days"
            onPointerMove={canHover ? onPointerMove : undefined}
            onPointerLeave={canHover ? clear : undefined}
          >
            {days.map((day, index) => {
              const hasRun = day.km > 0;
              const height = hasRun
                ? Math.max(4, (day.km / peak) * BAR_MAX_H)
                : 2;
              const y = BASELINE - height;
              const isActive = showHover && active === index;
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
