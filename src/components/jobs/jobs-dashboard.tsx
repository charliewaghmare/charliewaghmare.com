"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomSearch } from "@/components/jobs/custom-search";
import { JobCard } from "@/components/jobs/job-card";
import { formatTimestamp } from "@/lib/jobs/format";
import { defaultJobFilters, filterJobs, sortShortlist, uniqueSorted, type JobFilters } from "@/lib/jobs/filter";
import { appliedThisWeek, pageOf } from "@/lib/jobs/progress";
import { weightsTotal } from "@/lib/jobs/profile";
import { safeHttpUrl, type JobsPageModel, type SearchPreferences } from "@/lib/jobs/types";

type View = "discover" | "saved" | "applied" | "companies" | "settings";

export function JobsDashboard({
  model,
  unlocked,
}: {
  model: JobsPageModel;
  unlocked: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("discover");
  const [filters, setFilters] = useState<JobFilters>(defaultJobFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<SearchPreferences | null>(model.preferences);
  const [searchPrompt, setSearchPrompt] = useState("");
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const filterKey = `${view}:${JSON.stringify(filters)}`;
  const [shownState, setShownState] = useState({ key: filterKey, shown: 12 });
  const shown = shownState.key === filterKey ? shownState.shown : 12;

  const discoveryJobs = useMemo(
    () => model.jobs.filter((job) => job.inDiscovery !== false),
    [model.jobs],
  );
  const visibleJobs = useMemo(() => {
    const scoped =
      view === "saved"
        ? model.jobs.filter((job) => job.saved)
        : view === "applied"
          ? model.jobs.filter((job) => job.applied)
          : discoveryJobs;
    const matched = filterJobs(scoped, view === "saved" ? { ...filters, sort: "discovered" } : filters);
    return view === "saved" ? sortShortlist(matched) : matched;
  }, [discoveryJobs, filters, model.jobs, view]);

  const tags = uniqueSorted(discoveryJobs.flatMap((job) => job.tags));
  const locations = uniqueSorted(discoveryJobs.map((job) => job.location));
  const terms = uniqueSorted(discoveryJobs.map((job) => job.workTerm));
  const activeCount = discoveryJobs.length;
  const strongCount = discoveryJobs.filter((job) => job.matchScore >= 75).length;
  const recentCutoff = new Date();
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 7);
  const recentIso = recentCutoff.toISOString().slice(0, 10);
  const newCount = discoveryJobs.filter((job) => job.discoveredOn >= recentIso).length;
  const toApplyCount = model.jobs.filter((job) => job.saved && !job.applied).length;
  const appliedJobs = model.jobs.filter((job) => job.applied);
  const appliedWeekCount = appliedJobs.filter((job) => appliedThisWeek(job.appliedOn)).length;
  const page = pageOf(visibleJobs, shown);

  async function callApi(
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "DELETE" = "POST",
  ) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        suppressionId?: string;
      } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? "That action did not save.");
        return null;
      }
      if (payload?.suppressionId) {
        const ignored = model.jobs.find((job) => job.id === body.jobId);
        setUndo({ id: payload.suppressionId, title: ignored?.title ?? "That listing" });
      }
      if (method === "DELETE" && path === "/api/jobs/suppress") setUndo(null);
      if (payload?.message) setMessage(payload.message);
      router.refresh();
      return payload;
    } catch {
      setMessage("The request did not finish.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/jobs/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? "Could not unlock edit mode.");
        return;
      }
      setPin("");
      setPinOpen(false);
      router.refresh();
    } catch {
      setMessage("The request did not finish.");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    setBusy(true);
    await fetch("/api/jobs/session", { method: "DELETE" });
    setView("discover");
    setBusy(false);
    router.refresh();
  }

  useEffect(() => {
    if (!pinOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinOpen]);

  const privateViews: View[] = ["saved", "applied", "settings"];

  return (
    <div>
      <header className="td-divider border-b pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="td-overline">
              <Link href="/" className="td-link">
                CW
              </Link>
              <span aria-hidden="true"> / </span>
              <span>Jobs</span>
            </p>
            <h1 className="type-display td-text mt-3 text-[2.125rem] leading-[1.1] sm:text-[3rem]">
              Job Discovery
            </h1>
            <p className="td-muted mt-3 max-w-xl text-sm leading-6">
              Discovering opportunities worth pursuing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unlocked ? (
              <>
                <button
                  type="button"
                  className="jd-button"
                  disabled={busy}
                  onClick={() => callApi("/api/jobs/refresh", {})}
                >
                  Refresh jobs
                </button>
                <button type="button" className="jd-button" onClick={lock}>
                  Lock
                </button>
              </>
            ) : (
              <button type="button" className="jd-button" onClick={() => setPinOpen(true)}>
                Edit mode
              </button>
            )}
          </div>
        </div>
        {model.note ? (
          <p className="td-muted mt-6 max-w-2xl text-sm leading-6">{model.note}</p>
        ) : null}
        {message ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--td-accent)]" role="status">
            {message}
          </p>
        ) : null}
        {undo ? (
          <p className="mt-4 flex flex-wrap items-center gap-3 text-sm leading-6" role="status">
            <span>Ignored {undo.title}.</span>
            <button
              type="button"
              className="jd-button"
              disabled={busy}
              onClick={() => void callApi("/api/jobs/suppress", { suppressionId: undo.id }, "DELETE")}
            >
              Undo
            </button>
          </p>
        ) : null}
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Metric label="Active opportunities" value={String(activeCount)} />
        {unlocked ? (
          <>
            <Metric label="To apply" value={String(toApplyCount)} />
            <Metric label="Applied this week" value={String(appliedWeekCount)} />
            <Metric label="Applied total" value={String(appliedJobs.length)} />
          </>
        ) : (
          <>
            <Metric label="Strong matches" value={String(strongCount)} />
            <Metric label="New discoveries" value={String(newCount)} />
            <Metric
              label="Last successful refresh"
              value={formatTimestamp(model.lastSuccessfulRefresh) ?? "Not yet run"}
            />
          </>
        )}
      </section>
      {model.collection ? (
        <p className="td-muted mt-4 text-sm leading-6">
          Latest collection: {model.collection.status}
          {model.collection.completedAt
            ? ` · ${formatTimestamp(model.collection.completedAt)}`
            : ` · started ${formatTimestamp(model.collection.startedAt)}`}
          {model.collection.detail ? ` · ${model.collection.detail}` : ""}
        </p>
      ) : null}
      {model.research ? (
        <p className="td-muted mt-2 text-sm leading-6">
          Latest research: {model.research.status}
          {model.research.completedAt
            ? ` · ${formatTimestamp(model.research.completedAt)}`
            : ` · started ${formatTimestamp(model.research.startedAt)}`}
          {model.research.detail ? ` · ${model.research.detail}` : ""}
        </p>
      ) : null}

      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Job sections">
        {(["discover", "companies"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            className={view === item ? "jd-tab is-active" : "jd-tab"}
            aria-current={view === item ? "page" : undefined}
            onClick={() => setView(item)}
          >
            {labelView(item, unlocked)}
          </button>
        ))}
        {unlocked
          ? privateViews.map((item) => (
              <button
                key={item}
                type="button"
                className={view === item ? "jd-tab is-active" : "jd-tab"}
                aria-current={view === item ? "page" : undefined}
                onClick={() => setView(item)}
              >
                {labelView(item, unlocked)}
              </button>
            ))
          : null}
      </nav>

      {view === "companies" ? (
        <CompanyList companies={model.companies} />
      ) : view === "settings" && unlocked && preferences ? (
        <SettingsPanel
          preferences={preferences}
          coverage={model.coverage}
          ignored={model.ignored}
          searches={model.customSearches}
          searchPrompt={searchPrompt}
          busy={busy}
          onPreferences={setPreferences}
          onPrompt={setSearchPrompt}
          onSave={() => callApi("/api/jobs/preferences", preferences)}
          onSearch={() => callApi("/api/jobs/custom-search", { prompt: searchPrompt })}
          onUndo={(suppressionId) =>
            callApi("/api/jobs/suppress", { suppressionId }, "DELETE")
          }
        />
      ) : (
        <section className="mt-8">
          {unlocked && view === "discover" ? (
            <CustomSearch
              history={model.customSearches}
              busy={busy}
              onBusy={setBusy}
              onFinished={() => router.refresh()}
            />
          ) : null}
          <Filters
            filters={filters}
            tags={tags}
            locations={locations}
            terms={terms}
            onChange={setFilters}
          />
          <p className="td-muted mt-4 text-sm">
            {page.total === 0 ? "No matches" : `Showing ${page.visible.length} of ${page.total}`}
          </p>
          {page.total === 0 ? (
            <p className="td-card td-muted mt-4 px-4 py-8 text-sm leading-6">
              Nothing matches these filters. Lower the score threshold or clear a category.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {page.visible.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  unlocked={unlocked}
                  shortlist={view === "saved"}
                  expanded={expandedId === job.id}
                  busy={busy}
                  onToggle={() => setExpandedId((current) => (current === job.id ? null : job.id))}
                  onAction={callApi}
                />
              ))}
              {page.hasMore ? (
                <button
                  type="button"
                  className="jd-button"
                  onClick={() => setShownState({ key: filterKey, shown: shown + 12 })}
                >
                  Show more
                </button>
              ) : null}
            </div>
          )}
        </section>
      )}

      {pinOpen ? (
        <div className="td-modal-root" onMouseDown={() => setPinOpen(false)}>
          <form
            className="td-modal jd-pin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={unlock}
          >
            <h2 id="pin-title" className="type-display text-[1.5rem]">
              Edit mode
            </h2>
            <p className="td-muted mt-2 text-sm leading-6">
              Enter the owner PIN. Casual visitors can browse, not change listings.
            </p>
            <label className="mt-4 block text-sm">
              PIN
              <input
                className="jd-input mt-2"
                inputMode="numeric"
                autoComplete="off"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="submit" className="jd-button jd-button-primary" disabled={busy}>
                Unlock
              </button>
              <button type="button" className="jd-button" onClick={() => setPinOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="td-card px-4 py-4">
      <p className="td-label text-[0.75rem]">{label}</p>
      <p className="type-metric mt-2 text-[1.35rem] leading-tight">{value}</p>
    </article>
  );
}

function Filters({
  filters,
  tags,
  locations,
  terms,
  onChange,
}: {
  filters: JobFilters;
  tags: string[];
  locations: string[];
  terms: string[];
  onChange: (filters: JobFilters) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <label className="text-[0.8125rem]">
        Search
        <input
          className="jd-input mt-1"
          value={filters.query}
          placeholder="Title, company, keyword"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </label>
      <Select
        label="Category"
        value={filters.tag}
        onChange={(tag) => onChange({ ...filters, tag })}
        options={["any", ...tags]}
      />
      <Select
        label="Location"
        value={filters.location}
        onChange={(location) => onChange({ ...filters, location })}
        options={["any", ...locations]}
      />
      <Select
        label="Work term"
        value={filters.term}
        onChange={(term) => onChange({ ...filters, term })}
        options={["any", ...terms]}
      />
      <Select
        label="Arrangement"
        value={filters.arrangement}
        onChange={(arrangement) =>
          onChange({ ...filters, arrangement: arrangement as JobFilters["arrangement"] })
        }
        options={["any", "onsite", "hybrid", "remote"]}
      />
      <label className="text-[0.8125rem]">
        Sort
        <select
          className="jd-input mt-1"
          value={filters.sort}
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value as JobFilters["sort"] })
          }
        >
          <option value="score">Highest match score</option>
          <option value="discovered">Recently discovered</option>
          <option value="posted">Recently posted</option>
          <option value="company">Company</option>
        </select>
      </label>
      <label className="text-[0.8125rem] md:col-span-2 xl:col-span-3">
        Minimum match score: {filters.minScore}
        <input
          className="mt-2 block w-full accent-[var(--td-accent)]"
          type="range"
          min={0}
          max={100}
          value={filters.minScore}
          onChange={(event) => onChange({ ...filters, minScore: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[0.8125rem]">
      {label}
      <select className="jd-input mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "any" ? "Any" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompanyList({ companies }: { companies: JobsPageModel["companies"] }) {
  if (companies.length === 0) {
    return (
      <p className="td-card td-muted mt-8 px-4 py-8 text-sm leading-6">
        No companies to contact yet.
      </p>
    );
  }
  return (
    <div className="mt-8 grid gap-3 md:grid-cols-2">
      {companies.map((company) => (
        <article key={company.id} className="td-card p-4 sm:p-5">
          <p className="td-overline">{company.industry}</p>
          <h3 className="type-display mt-2 text-[1.4rem]">{company.name}</h3>
          <p className="td-muted mt-2 text-sm">{company.location}</p>
          <p className="mt-3 text-sm leading-6">{company.why}</p>
          <p className="td-muted mt-3 text-[0.8125rem]">
            {company.hasVerifiedOpening ? "Verified opening on file." : "No verified internship on file."}
            {company.monitoringStatus ? ` ${company.monitoringStatus}.` : ""}
            {company.lastCheckedAt ? ` Last checked ${formatTimestamp(company.lastCheckedAt)}.` : ""}
            {company.isSample ? " Sample company." : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {safeHttpUrl(company.website) ? (
              <a className="td-link" href={safeHttpUrl(company.website) ?? undefined} target="_blank" rel="noreferrer">
                Website
              </a>
            ) : null}
            {safeHttpUrl(company.careersUrl) ? (
              <a className="td-link" href={safeHttpUrl(company.careersUrl) ?? undefined} target="_blank" rel="noreferrer">
                Careers
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function SettingsPanel({
  preferences,
  coverage,
  ignored,
  searches,
  searchPrompt,
  busy,
  onPreferences,
  onPrompt,
  onSave,
  onSearch,
  onUndo,
}: {
  preferences: SearchPreferences;
  coverage: JobsPageModel["coverage"];
  ignored: JobsPageModel["ignored"];
  searches: JobsPageModel["customSearches"];
  searchPrompt: string;
  busy: boolean;
  onPreferences: (preferences: SearchPreferences) => void;
  onPrompt: (prompt: string) => void;
  onSave: () => void;
  onSearch: () => void;
  onUndo: (suppressionId: string) => void;
}) {
  const total = weightsTotal(preferences.weights);
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      {coverage ? <CoveragePanel coverage={coverage} /> : null}
      <section className="td-card p-4 sm:p-5">
        <h2 className="type-section text-[1.15rem]">Ranking weights</h2>
        <p className="td-muted mt-2 text-sm leading-6">
          These weights are stored for a later scoring pass. They do not rescore the sample cards.
        </p>
        <div className="mt-4 grid gap-3">
          {(
            [
              ["interest", "Personal interest"],
              ["location", "Location"],
              ["qualifications", "Qualifications"],
              ["career", "Career value"],
              ["compensation", "Compensation"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-[0.8125rem]">
              {label}
              <input
                className="jd-input mt-1"
                type="number"
                min={0}
                max={100}
                value={preferences.weights[key]}
                onChange={(event) =>
                  onPreferences({
                    ...preferences,
                    weights: { ...preferences.weights, [key]: Number(event.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="td-muted mt-3 text-[0.8125rem]">Total {total} / 100</p>
        <label className="mt-4 block text-[0.8125rem]">
          Minimum score default
          <input
            className="jd-input mt-1"
            type="number"
            min={0}
            max={100}
            value={preferences.minScore}
            onChange={(event) =>
              onPreferences({ ...preferences, minScore: Number(event.target.value) })
            }
          />
        </label>
        <button type="button" className="jd-button jd-button-primary mt-4" disabled={busy || total !== 100} onClick={onSave}>
          Save preferences
        </button>
      </section>

      <section className="td-card p-4 sm:p-5">
        <h2 className="type-section text-[1.15rem]">Custom search</h2>
        <p className="td-muted mt-2 text-sm leading-6">
          Custom research runs from Discover while edit mode is unlocked. Scheduled research still runs on its own.
        </p>
        <textarea
          className="jd-input mt-4 min-h-28"
          value={searchPrompt}
          onChange={(event) => onPrompt(event.target.value)}
          placeholder="Find NASCAR engineering internships in Canada or the United States."
        />
        <button type="button" className="jd-button mt-3" disabled={busy} onClick={onSearch}>
          Save search note
        </button>
        {searches.length > 0 ? (
          <ul className="mt-4 space-y-3 text-sm">
            {searches.map((search) => (
              <li key={search.id}>
                <p>{search.prompt}</p>
                <p className="td-muted text-[0.75rem]">
                  {search.status === "not_implemented" ? "Not run" : search.status}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="td-card p-4 sm:p-5 lg:col-span-2">
        <h2 className="type-section text-[1.15rem]">Ignored listings</h2>
        {ignored.length === 0 ? (
          <p className="td-muted mt-3 text-sm leading-6">Nothing ignored yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--td-border-subtle)]">
            {ignored.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm">{job.title}</p>
                  <p className="td-muted text-[0.8125rem]">{job.companyName}</p>
                </div>
                <button type="button" className="jd-button" disabled={busy} onClick={() => onUndo(job.id)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="td-muted mt-6 text-sm leading-6">
          <p>{preferences.strategy}</p>
          <p className="mt-2">{preferences.qualificationApproach}</p>
          <p className="mt-2">{preferences.feedbackAdaptation}</p>
        </div>
      </section>
    </div>
  );
}

function CoveragePanel({ coverage }: { coverage: NonNullable<JobsPageModel["coverage"]> }) {
  const rows = [
    ["Companies monitored", coverage.monitored],
    ["Verified ATS sources", coverage.verifiedSources],
    ["Postings fetched", coverage.fetched],
    ["Eligible student roles", coverage.eligible],
    ["Ineligible professional roles", coverage.ineligible],
    ["Uncertain eligibility", coverage.uncertain],
    ["Eligible but held back", coverage.withheldEligible],
    ["Eligible below 50", coverage.belowThreshold],
    ["Eligible at 50 or above", coverage.aboveThreshold],
    ["New jobs saved", coverage.inserted],
    ["Duplicates", coverage.duplicates],
    ["Suppressed", coverage.suppressed],
    ["AI jobs saved", coverage.aiImported],
    ["AI searches", coverage.aiSearchCalls ?? "—"],
    ["AI estimated cost", coverage.aiCost == null ? "—" : `$${coverage.aiCost}`],
  ];
  return (
    <section className="td-card p-4 sm:p-5 lg:col-span-2">
      <h2 className="type-section text-[1.15rem]">Discovery coverage</h2>
      <p className="td-muted mt-2 text-sm leading-6">
        Eligible roles under 50 stay in Discover. Lower the minimum match score to see them. Held-back roles are student postings outside the location rules.
        {coverage.needsAttention.length > 0
          ? ` Sources still pending: ${coverage.needsAttention.join(", ")}.`
          : ""}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={String(label)}>
            <dt className="td-muted text-[0.75rem]">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="td-muted mt-4 text-[0.8125rem] leading-6">
        Last collection {formatTimestamp(coverage.lastCollection) ?? "not recorded"}. Last research{" "}
        {formatTimestamp(coverage.lastResearch) ?? "not recorded"}.
      </p>
      {coverage.bySource.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[0.8125rem] leading-6">
          {coverage.bySource.slice(0, 12).map((source) => (
            <li key={`${source.provider}-${source.name}`}>
              {source.name} ({source.provider}): {source.fetched} fetched, {source.eligible} eligible, {source.aboveThreshold} at 50 or above
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function labelView(view: View, unlocked: boolean): string {
  if (view === "discover") return "Discover";
  if (view === "saved") return unlocked ? "To Apply" : "Saved";
  if (view === "applied") return "Applied";
  if (view === "companies") return "Companies";
  return "Settings";
}
