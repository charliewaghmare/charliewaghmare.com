"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredSearch } from "@/lib/jobs/types";
import { formatTimestamp } from "@/lib/jobs/format";
import { DEPTH_LIMITS, type ResearchDepth } from "@/lib/jobs/research/depth";

type ResearchResult = {
  title: string;
  employer: string;
  url: string | null;
  score: number;
  outcome: string;
  belowThreshold: boolean;
};

type RunPayload = {
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  summary: {
    depth?: string;
    queries?: number;
    candidates?: number;
    verified?: number;
    eligible?: number;
    imported?: number;
    updated?: number;
    duplicates?: number;
    uncertain?: number;
    rejectedProfessional?: number;
    withheld?: number;
    belowThreshold?: number;
    companiesAdded?: number;
    companiesWithoutOpenings?: number;
    estimatedUsd?: number | null;
    results?: ResearchResult[];
    errors?: string[];
  } | null;
};

export function CustomSearch({
  history,
  busy,
  onBusy,
  onFinished,
}: {
  history: StoredSearch[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onFinished: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(onFinished);

  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      const response = await fetch(`/api/jobs/custom-search?id=${runId}`);
      const payload = (await response.json().catch(() => null)) as { run?: RunPayload; message?: string } | null;
      if (stopped) return;
      if (!response.ok || !payload?.run) {
        setError(payload?.message ?? "Could not read the research run.");
        return;
      }
      setRun(payload.run);
      if (["success", "failed", "partial"].includes(payload.run.status)) {
        stopped = true;
        window.clearInterval(timer);
        finished.current();
      }
    };
    void tick();
    timer = window.setInterval(() => void tick(), 8000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [runId]);

  async function start(nextPrompt = prompt, nextDepth = depth) {
    setError(null);
    setRun(null);
    onBusy(true);
    try {
      const response = await fetch("/api/jobs/custom-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, depth: nextDepth }),
      });
      const payload = (await response.json().catch(() => null)) as { runId?: string; message?: string } | null;
      if (!response.ok || !payload?.runId) {
        setError(payload?.message ?? "Research did not start.");
        return;
      }
      setPrompt(nextPrompt);
      setDepth(nextDepth);
      setRunId(payload.runId);
      setRun({ status: "requested", error: null, startedAt: new Date().toISOString(), completedAt: null, summary: { depth: nextDepth } });
    } catch {
      setError("The request did not finish.");
    } finally {
      onBusy(false);
    }
  }

  const ceiling = DEPTH_LIMITS[depth].maxSpendUsd;
  const summary = run?.summary;
  const done = run && ["success", "failed", "partial"].includes(run.status);

  return (
    <section className="td-card mt-8 p-4 sm:p-5">
      <h2 className="type-section text-[1.15rem]">Custom research</h2>
      <p className="td-muted mt-2 text-sm leading-6">
        Describe the internships to look for. The approximate budget for {depth} is ${ceiling.toFixed(2)}. The run stops
        when the recorded estimate reaches that ceiling. The provider bills actual usage, which can differ slightly.
      </p>
      <textarea
        className="jd-input mt-4 min-h-28"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Find motorsports engineering internships for Summer 2027."
        maxLength={500}
      />
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Research depth">
        {(["quick", "standard", "deep"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={depth === item ? "jd-tab is-active" : "jd-tab"}
            aria-pressed={depth === item}
            onClick={() => setDepth(item)}
          >
            {item[0].toUpperCase() + item.slice(1)} · ${DEPTH_LIMITS[item].maxSpendUsd.toFixed(2)}
          </button>
        ))}
      </div>
      <button type="button" className="jd-button jd-button-primary mt-4" disabled={busy || prompt.trim().length < 8} onClick={() => void start()}>
        {busy ? "Starting" : "Search"}
      </button>
      {error ? <p className="mt-3 text-sm leading-6 text-[var(--td-accent)]">{error}</p> : null}
      {run ? (
        <div className="mt-4 text-sm leading-6" role="status">
          <p>
            Status: {run.status}
            {summary?.depth ? ` · ${summary.depth}` : ""}
            {run.completedAt && run.startedAt
              ? ` · ${Math.max(1, Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 60000))} min`
              : ""}
          </p>
          {done && summary ? (
            <ul className="td-muted mt-2 space-y-1">
              <li>Candidates {summary.candidates ?? 0}</li>
              <li>Verified {summary.verified ?? 0}</li>
              <li>Student-eligible {summary.eligible ?? 0}</li>
              <li>Newly added {summary.imported ?? 0}</li>
              <li>Already known {summary.duplicates ?? summary.updated ?? 0}</li>
              <li>
                Rejected or uncertain {(summary.rejectedProfessional ?? 0) + (summary.uncertain ?? 0) + (summary.withheld ?? 0)}
              </li>
              <li>Below the default score of 50: {summary.belowThreshold ?? 0}</li>
              <li>New companies {summary.companiesAdded ?? 0}</li>
              <li>Companies without a verified opening {summary.companiesWithoutOpenings ?? 0}</li>
              <li>Estimated cost {summary.estimatedUsd == null ? "not reported" : `$${summary.estimatedUsd}`}</li>
            </ul>
          ) : (
            <p className="td-muted mt-2">The research run is queued. This page checks every few seconds.</p>
          )}
          {run.error ? <p className="mt-2 text-[var(--td-accent)]">{run.error}</p> : null}
          {summary?.results && summary.results.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {summary.results.map((item) => (
                <li key={`${item.employer}-${item.title}`}>
                  <span className="td-text">{item.title}</span>
                  <span className="td-muted"> · {item.employer} · {item.score}</span>
                  <span className="td-muted">
                    {" "}
                    · {item.outcome === "inserted" ? "New" : item.outcome === "eligible" ? "Verified" : "Already known"}
                    {item.belowThreshold ? " · Below 50" : ""}
                  </span>
                  {item.url ? (
                    <>
                      {" "}
                      <a className="td-link" href={item.url} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm">Search history</h3>
          <ul className="mt-2 space-y-3 text-sm">
            {history.map((search) => (
              <li key={search.id}>
                <p>{search.prompt}</p>
                <p className="td-muted text-[0.75rem]">
                  {formatTimestamp(search.createdAt)} · {search.depth ?? "unspecified"} · {search.status}
                  {search.added != null ? ` · ${search.added} new` : ""}
                  {search.cost != null ? ` · about $${search.cost}` : ""}
                </p>
                <button
                  type="button"
                  className="jd-button mt-2"
                  disabled={busy}
                  onClick={() => void start(search.prompt, (search.depth as ResearchDepth | null) ?? "standard")}
                >
                  Run again
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
