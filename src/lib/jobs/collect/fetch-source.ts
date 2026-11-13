import {
  mapAshbyJob,
  mapGreenhouseJob,
  mapLeverJob,
  mapSmartRecruitersJob,
  mapWorkableJob,
  mapWorkdayJob,
} from "@/lib/jobs/collect/map-source";
import type { CollectedPosting } from "@/lib/jobs/collect/rules";
import { isStudentFacing, blob, studentTitleEvidence } from "@/lib/jobs/collect/rules";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

const LIST_CAP = 400;
const DETAIL_CAP = 30;

export class SourceFailure extends Error {
  constructor(
    readonly provider: string,
    readonly boardId: string,
    readonly status: number | null,
  ) {
    super(`${provider} ${boardId} failed${status ? ` (${status})` : ""}`);
  }
}

export async function fetchBoard(
  company: WatchCompany,
  fetchImpl: typeof fetch = fetch,
  snapshot: { complete: boolean } = { complete: false },
): Promise<CollectedPosting[]> {
  snapshot.complete = false;
  if (!company.provider || !company.boardId) return [];
  if (company.provider === "greenhouse") {
    const jobs = await fetchGreenhouse(company, fetchImpl);
    snapshot.complete = true;
    return jobs;
  }
  if (company.provider === "lever") return fetchLever(company, fetchImpl, snapshot);
  if (company.provider === "ashby") {
    const jobs = await fetchAshby(company, fetchImpl);
    snapshot.complete = true;
    return jobs;
  }
  if (company.provider === "smartrecruiters") return fetchSmartRecruiters(company, fetchImpl, snapshot);
  if (company.provider === "workable") return fetchWorkable(company, fetchImpl, snapshot);
  if (company.provider === "workday") return fetchWorkday(company, fetchImpl);
  return [];
}

async function fetchGreenhouse(
  company: WatchCompany,
  fetchImpl: typeof fetch,
): Promise<CollectedPosting[]> {
  const board = company.boardId ?? "";
  const list = (await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
    fetchImpl,
    company,
  )) as { jobs?: unknown[] };
  if (!Array.isArray(list.jobs)) throw new SourceFailure("greenhouse", board, null);
  const jobs = list.jobs;
  return jobs.flatMap((job) => {
    const mapped = mapGreenhouseJob(job, company.name);
    return mapped ? [mapped] : [];
  });
}

async function fetchLever(
  company: WatchCompany,
  fetchImpl: typeof fetch,
  snapshot: { complete: boolean },
): Promise<CollectedPosting[]> {
  const host = company.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
  const postings: CollectedPosting[] = [];
  let skip = 0;
  for (let page = 0; page < 10; page += 1) {
    const url = `${host}/v0/postings/${encodeURIComponent(company.boardId ?? "")}?mode=json&skip=${skip}&limit=100`;
    const batch = await getJson(url, fetchImpl, company);
    if (!Array.isArray(batch)) throw new SourceFailure("lever", company.boardId ?? "", null);
    if (batch.length === 0) { snapshot.complete = true; break; }
    for (const item of batch) {
      const mapped = mapLeverJob(item, company.name);
      if (mapped) postings.push(mapped);
    }
    if (batch.length < 100) { snapshot.complete = true; break; }
    skip += batch.length;
    await pause();
  }
  return postings;
}

async function fetchAshby(
  company: WatchCompany,
  fetchImpl: typeof fetch,
): Promise<CollectedPosting[]> {
  const payload = (await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.boardId ?? "")}`,
    fetchImpl,
    company,
  )) as { jobs?: unknown[] };
  if (!Array.isArray(payload.jobs)) throw new SourceFailure("ashby", company.boardId ?? "", null);
  const jobs = payload.jobs;
  return jobs.flatMap((job) => {
    const mapped = mapAshbyJob(job, company.name);
    return mapped ? [mapped] : [];
  });
}

export function parseWorkdayBoard(boardId: string): { host: string; tenant: string; site: string } | null {
  const [host, tenant, site, extra] = boardId.split("/");
  if (extra || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.myworkdayjobs\.com$/i.test(host ?? "") ||
      !/^[a-z0-9_-]+$/i.test(tenant ?? "") || !/^[a-z0-9_-]+$/i.test(site ?? "")) return null;
  return { host, tenant, site };
}

async function fetchSmartRecruiters(company: WatchCompany, fetchImpl: typeof fetch, snapshot: { complete: boolean }): Promise<CollectedPosting[]> {
  const board = company.boardId ?? "";
  const listed: CollectedPosting[] = [];
  for (let offset = 0; offset < LIST_CAP; offset += 100) {
    const payload = (await getJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=100&offset=${offset}`,
      fetchImpl,
      company,
    )) as { content?: unknown[] };
    if (!Array.isArray(payload.content)) throw new SourceFailure("smartrecruiters", board, null);
    const content = payload.content;
    for (const item of content) {
      const mapped = mapSmartRecruitersJob(item, company.name, board);
      if (mapped) listed.push(mapped);
    }
    if (content.length < 100) { snapshot.complete = true; break; }
    await pause();
  }
  return enrichStudentPostings(listed, DETAIL_CAP, async (posting) => {
    const detail = await getJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${encodeURIComponent(posting.sourceId)}`,
      fetchImpl,
      company,
    );
    return mapSmartRecruitersJob(detail, company.name, board) ?? posting;
  });
}

async function fetchWorkable(company: WatchCompany, fetchImpl: typeof fetch, snapshot: { complete: boolean }): Promise<CollectedPosting[]> {
  const board = company.boardId ?? "";
  const listed: CollectedPosting[] = [];
  let token: string | null = null;
  for (let page = 0; page < 4 && listed.length < LIST_CAP; page += 1) {
    const body = token ? { token } : {};
    const payload = (await postJson(
      `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(board)}/jobs`,
      body,
      fetchImpl,
      company,
    )) as { results?: unknown[]; nextPage?: unknown };
    if (!Array.isArray(payload.results)) throw new SourceFailure("workable", board, null);
    const results = payload.results;
    for (const item of results) {
      const mapped = mapWorkableJob(item, company.name, board);
      if (mapped) listed.push(mapped);
    }
    token = typeof payload.nextPage === "string" ? payload.nextPage : null;
    if (!token) { snapshot.complete = true; break; }
    if (results.length === 0) break;
    await pause();
  }
  return enrichStudentPostings(listed, DETAIL_CAP, async (posting) => {
    const detail = await getJson(
      `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(board)}/jobs/${encodeURIComponent(posting.sourceId)}`,
      fetchImpl,
      company,
    );
    return mapWorkableJob(detail, company.name, board) ?? posting;
  });
}

async function fetchWorkday(company: WatchCompany, fetchImpl: typeof fetch): Promise<CollectedPosting[]> {
  const parsed = parseWorkdayBoard(company.boardId ?? "");
  if (!parsed) throw new SourceFailure("workday", company.boardId ?? "", null);
  const seen = new Map<string, { title: string; path: string; location: string | null }>();
  for (const term of ["internship", "co-op", "undergraduate"]) {
    let offset = 0;
    for (let page = 0; page < 3; page += 1) {
      const payload = (await postJson(
        `https://${parsed.host}/wday/cxs/${encodeURIComponent(parsed.tenant)}/${encodeURIComponent(parsed.site)}/jobs`,
        { appliedFacets: {}, limit: 20, offset, searchText: term },
        fetchImpl,
        company,
      )) as { total?: number; jobPostings?: unknown[] };
      if (!Array.isArray(payload.jobPostings)) throw new SourceFailure("workday", company.boardId ?? "", null);
      const jobs = payload.jobPostings;
      for (const item of jobs) {
        if (!item || typeof item !== "object") continue;
        const row = item as { title?: unknown; externalPath?: unknown; locationsText?: unknown };
        const path = typeof row.externalPath === "string" ? row.externalPath : "";
        const title = typeof row.title === "string" ? row.title : "";
        if (!path || !title || seen.has(path)) continue;
        seen.set(path, { title, path, location: typeof row.locationsText === "string" ? row.locationsText : null });
      }
      offset += jobs.length;
      if (jobs.length === 0 || offset >= (payload.total ?? offset)) break;
      await pause();
    }
  }
  const postings: CollectedPosting[] = [];
  let details = 0;
  for (const item of seen.values()) {
    const postingUrl = `https://${parsed.host}/${encodeURIComponent(parsed.site)}${item.path.startsWith("/") ? "" : "/"}${item.path}`;
    if (details >= DETAIL_CAP || !titleLooksRelevant(item.title)) {
      postings.push({
        provider: "workday",
        sourceId: item.path,
        title: item.title,
        companyName: company.name,
        location: item.location,
        country: null,
        workArrangement: null,
        description: "",
        departments: [],
        sourceUrl: postingUrl,
        applicationUrl: postingUrl,
        postedOn: null,
        employmentType: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
      });
      continue;
    }
    details += 1;
    try {
      const detail = await getJson(
        `https://${parsed.host}/wday/cxs/${encodeURIComponent(parsed.tenant)}/${encodeURIComponent(parsed.site)}${item.path}`,
        fetchImpl,
        company,
      );
      const mapped = mapWorkdayJob(detail, company.name, postingUrl);
      if (mapped) {
        postings.push(mapped);
        await pause();
        continue;
      }
    } catch {
      // Keep the listing when a single detail page fails.
    }
    postings.push({
      provider: "workday",
      sourceId: item.path,
      title: item.title,
      companyName: company.name,
      location: item.location,
      country: null,
      workArrangement: null,
      description: "",
      departments: [],
      sourceUrl: postingUrl,
      applicationUrl: postingUrl,
      postedOn: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
    });
    await pause();
  }
  return postings;
}

async function enrichStudentPostings(
  listed: CollectedPosting[],
  cap: number,
  detail: (posting: CollectedPosting) => Promise<CollectedPosting>,
): Promise<CollectedPosting[]> {
  let used = 0;
  const enriched: CollectedPosting[] = [];
  for (const posting of listed) {
    if (used >= cap || !titleLooksRelevant(posting.title)) {
      enriched.push(posting);
      continue;
    }
    used += 1;
    try {
      enriched.push(await detail(posting));
    } catch {
      enriched.push(posting);
    }
    await pause();
  }
  return enriched;
}

export function titleLooksRelevant(title: string): boolean {
  const text = title.toLowerCase();
  if (isStudentFacing(text)) return true;
  if (studentTitleEvidence(text)) return true;
  return /\b(intern|co-op|coop|student|new grad|early career)\b/.test(text);
}

async function getJson(url: string, fetchImpl: typeof fetch, company: WatchCompany): Promise<unknown> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "application/json", "user-agent": "charliewaghmare-jobs/1.0" },
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await pause();
  }
  throw new SourceFailure(company.provider ?? "source", company.boardId ?? "", lastStatus);
}

async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
  company: WatchCompany,
): Promise<unknown> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "charliewaghmare-jobs/1.0",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await pause();
  }
  throw new SourceFailure(company.provider ?? "source", company.boardId ?? "", lastStatus);
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

export function relevantEnough(posting: CollectedPosting): boolean {
  return titleLooksRelevant(posting.title) || isStudentFacing(blob(posting));
}

/** Verify a feed-discovered posting outside a capped board listing. */
export async function fetchPosting(company: WatchCompany, value: string, fetchImpl: typeof fetch = fetch): Promise<CollectedPosting | null> {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  const board = company.boardId ?? "";
  if (company.provider === "greenhouse") {
    const id = parts[parts.indexOf("jobs") + 1];
    if (!id || !/^\d+$/.test(id)) return null;
    return mapGreenhouseJob(await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`, fetchImpl, company), company.name);
  }
  if (company.provider === "lever" && parts[1]) {
    const host = company.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
    return mapLeverJob(await getJson(`${host}/v0/postings/${encodeURIComponent(board)}/${encodeURIComponent(parts[1])}`, fetchImpl, company), company.name);
  }
  if (company.provider === "smartrecruiters" && parts[1]) {
    const id = parts[1].split("-")[0];
    return mapSmartRecruitersJob(await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${encodeURIComponent(id)}`, fetchImpl, company), company.name, board);
  }
  if (company.provider === "workable") {
    const id = parts[parts.indexOf("j") + 1];
    if (!id) return null;
    return mapWorkableJob(await getJson(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`, fetchImpl, company), company.name, board);
  }
  if (company.provider === "workday") {
    const parsed = parseWorkdayBoard(board);
    const jobIndex = parts.indexOf("job");
    if (!parsed || jobIndex < 0) return null;
    const path = "/" + parts.slice(jobIndex).join("/");
    return mapWorkdayJob(await getJson(`https://${parsed.host}/wday/cxs/${encodeURIComponent(parsed.tenant)}/${encodeURIComponent(parsed.site)}${path}`, fetchImpl, company), company.name, value);
  }
  return null;
}
