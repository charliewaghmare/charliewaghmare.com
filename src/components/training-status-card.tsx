import type { DashboardMetric } from "@/lib/garmin/series";
import { formatPace } from "@/lib/garmin/format";
import { WithUnits } from "@/components/training-units";

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  productive: { label: "Productive", color: "#4ade80" },
  maintaining: { label: "Maintaining", color: "#60a5fa" },
  peaking: { label: "Peaking", color: "#a78bfa" },
  recovery: { label: "Recovery", color: "#f8fafc" },
  detraining: { label: "Detraining", color: "#facc15" },
  strained: { label: "Strained", color: "#f87171" },
  overreaching: { label: "Overreaching", color: "#fb923c" },
};

export function TrainingStatusCard({ metric }: { metric: DashboardMetric }) {
  const cleanValue = metric.value.replace(/[\s_-]*\(?\d+\)?\s*$/, "").trim();
  const status = STATUS_STYLES[cleanValue.toLowerCase()];
  const threshold = metric.lactateThreshold;
  const pace = threshold?.paceSecondsPerKm != null
    ? formatPace(1000, threshold.paceSecondsPerKm) : null;
  const heartRate = threshold?.heartRate != null ? `${Math.round(threshold.heartRate)} bpm` : null;

  return (
    <article className="td-card flex min-h-[8.5rem] flex-col px-4 py-4">
      <p className="td-label text-sm font-medium leading-5">{metric.label}</p>
      <h3 className="td-status-name type-metric mt-2 leading-[1.1]">
        {status?.label ?? (cleanValue || "—")}
      </h3>
      <div className="td-status-bar mt-4" style={{ color: status?.color ?? "var(--td-muted)" }} aria-hidden="true" />
      <div className="mt-6">
        <p className="td-label text-sm font-medium">Lactate threshold</p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="td-label text-xs">Pace</dt>
            <dd className="type-metric mt-1 text-2xl leading-none"><WithUnits text={pace ?? "—"} /></dd>
          </div>
          <div>
            <dt className="td-label text-xs">Heart rate</dt>
            <dd className="type-metric mt-1 text-2xl leading-none"><WithUnits text={heartRate ?? "—"} /></dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
