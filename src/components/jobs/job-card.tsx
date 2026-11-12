"use client";

import { useState } from "react";
import { formatJobDate } from "@/lib/jobs/format";
import { safeHttpUrl, scoreBand, type ApplicationStage, type JobListing } from "@/lib/jobs/types";

const stages: { id: ApplicationStage; label: string }[] = [
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
  { id: "withdrawn", label: "Withdrawn" },
];

export function JobCard({
  job,
  unlocked,
  expanded,
  onToggle,
  onAction,
  busy,
}: {
  job: JobListing;
  unlocked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAction: (path: string, body: Record<string, unknown>, method?: "POST" | "DELETE") => void;
  busy: boolean;
}) {
  const band = scoreBand(job.matchScore);
  const applyUrl = safeHttpUrl(job.applicationUrl);
  const [confirmIgnore, setConfirmIgnore] = useState(false);
  const canEdit = unlocked && job.persisted;

  return (
    <article className="td-card jd-job-card p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <CompanyMark name={job.companyName} logoUrl={safeHttpUrl(job.companyLogoUrl)} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="jd-expand"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <h3 className="type-display td-text text-left text-[1.35rem] leading-tight">
              {job.title}
            </h3>
            <p className="td-muted mt-1 text-sm">{job.companyName}</p>
          </button>
          <p className="td-muted mt-3 text-[0.8125rem] leading-5">
            {job.location}
            <span aria-hidden="true"> · </span>
            {labelArrangement(job.workArrangement)}
            <span aria-hidden="true"> · </span>
            {job.workTerm}
          </p>
          {job.salaryLabel ? (
            <p className="type-figure td-text mt-2 text-sm">{job.salaryLabel}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.tags.map((tag) => (
              <span key={tag} className="jd-tag">
                {tag}
              </span>
            ))}
            {job.isSample ? <span className="jd-tag jd-tag-sample">Sample data</span> : null}
            {job.lifecycleStatus === "stale" ? <span className="jd-tag">Not seen on the last check</span> : null}
            {job.saved ? <span className="jd-tag">Saved</span> : null}
            {job.applied ? <span className="jd-tag">Applied</span> : null}
          </div>
          {job.recommendation ? (
            <p className="td-muted mt-3 text-sm leading-6">{job.recommendation}</p>
          ) : null}
        </div>
        <div className={`jd-score jd-score-${band.id}`}>
          <p className="type-metric text-[1.75rem] leading-none">{job.matchScore}</p>
          <p className="mt-1 text-[0.6875rem] leading-4">{band.label}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {applyUrl ? (
          <a
            className="jd-button jd-button-primary"
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Apply
          </a>
        ) : (
          <button type="button" className="jd-button" disabled>
            No application link
          </button>
        )}
        {canEdit ? (
          <>
            <button
              type="button"
              className="jd-button"
              disabled={busy}
              onClick={() => onAction("/api/jobs/status", { jobId: job.id, saved: !job.saved })}
            >
              {job.saved ? "Unsave" : "Save"}
            </button>
            <button
              type="button"
              className="jd-button"
              disabled={busy}
              onClick={() =>
                onAction("/api/jobs/status", {
                  jobId: job.id,
                  applied: !job.applied,
                  stage: job.applied ? null : "applied",
                })
              }
            >
              {job.applied ? "Clear applied" : "Mark applied"}
            </button>
            {confirmIgnore ? (
              <button
                type="button"
                className="jd-button"
                disabled={busy}
                onClick={() => onAction("/api/jobs/suppress", { jobId: job.id })}
              >
                Confirm ignore
              </button>
            ) : (
              <button type="button" className="jd-button" onClick={() => setConfirmIgnore(true)}>
                Ignore
              </button>
            )}
          </>
        ) : null}
        <button type="button" className="jd-button jd-button-quiet" onClick={onToggle}>
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>
      {!canEdit && unlocked ? (
        <p className="td-muted mt-3 text-[0.8125rem] leading-5">
          Sample preview rows are not stored. Tracking starts after a listing is in Supabase.
        </p>
      ) : null}

      {expanded ? (
        <div className="td-divider mt-5 space-y-4 border-t pt-4 text-sm leading-6">
          {job.description ? <p>{job.description}</p> : null}
          <DetailList title="Responsibilities" items={job.responsibilities} />
          <DetailList title="Qualifications" items={job.qualifications} />
          <DetailList title="Skills" items={job.skills} />
          <DetailList title="Possible gaps" items={job.skillGaps} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <Meta label="Posted" value={formatJobDate(job.postedOn) ?? "Not verified"} />
            <Meta label="First discovered" value={formatJobDate(job.discoveredOn) ?? "Unknown"} />
            <Meta label="Deadline" value={formatJobDate(job.deadline) ?? "Not listed"} />
            <Meta label="Source" value={job.source} />
          </dl>
          {job.scoreBreakdown ? (
            <p className="td-muted text-[0.8125rem]">
              Sample breakdown · interest {job.scoreBreakdown.interest} · location{" "}
              {job.scoreBreakdown.location} · qualifications {job.scoreBreakdown.qualifications} ·
              career {job.scoreBreakdown.career} · compensation {job.scoreBreakdown.compensation}
            </p>
          ) : null}
          {safeHttpUrl(job.sourceUrl) ? (
            <a className="td-link text-sm" href={safeHttpUrl(job.sourceUrl) ?? undefined} target="_blank" rel="noreferrer">
              Original source
            </a>
          ) : (
            <p className="td-muted text-[0.8125rem]">No source URL on file.</p>
          )}
          {canEdit && job.applied ? (
            <label className="block text-[0.8125rem]">
              <span className="td-label">Application stage</span>
              <select
                className="jd-input mt-2"
                value={job.stage ?? "applied"}
                disabled={busy}
                onChange={(event) =>
                  onAction("/api/jobs/status", {
                    jobId: job.id,
                    applied: true,
                    stage: event.target.value,
                  })
                }
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="td-label text-[0.75rem] font-medium">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="td-label text-[0.75rem]">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function CompanyMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="jd-logo" />
    );
  }
  return (
    <div className="jd-logo" aria-hidden="true">
      {name.slice(0, 1)}
    </div>
  );
}

function labelArrangement(value: JobListing["workArrangement"]): string {
  if (value === "onsite") return "Onsite";
  if (value === "hybrid") return "Hybrid";
  return "Remote";
}
