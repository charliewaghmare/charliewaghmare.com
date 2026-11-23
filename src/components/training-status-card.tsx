import type { DashboardMetric } from "@/lib/garmin/series";

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

  return (
    <article className="td-card flex min-h-[8.5rem] flex-col px-4 py-4">
      <p className="td-label text-[0.8125rem] font-medium leading-5">{metric.label}</p>
      <h3 className="type-metric mt-2 text-[1.375rem] leading-[1.15] sm:text-[1.5rem]">
        {status?.label ?? (cleanValue || "—")}
      </h3>
      <div
        className="td-status-bar mt-4"
        style={{ color: status?.color ?? "var(--td-muted)" }}
        aria-hidden="true"
      />
      <p className="td-muted mt-3 text-[0.8125rem] leading-5">{metric.explanation}</p>
    </article>
  );
}
