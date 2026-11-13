import { mapAshbyJob, mapGreenhouseJob, mapLeverJob } from "@/lib/jobs/collect/map-source";
import type { CollectedPosting } from "@/lib/jobs/collect/rules";
import { isStudentFacing, blob } from "@/lib/jobs/collect/rules";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

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
): Promise<CollectedPosting[]> {
  if (!company.provider || !company.boardId) return [];
  if (company.provider === "greenhouse") return fetchGreenhouse(company, fetchImpl);
  if (company.provider === "lever") return fetchLever(company, fetchImpl);
  if (company.provider === "ashby") return fetchAshby(company, fetchImpl);
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
  const jobs = Array.isArray(list.jobs) ? list.jobs : [];
  return jobs.flatMap((job) => {
    const mapped = mapGreenhouseJob(job, company.name);
    return mapped ? [mapped] : [];
  });
}

async function fetchLever(
  company: WatchCompany,
  fetchImpl: typeof fetch,
): Promise<CollectedPosting[]> {
  const host = company.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
  const postings: CollectedPosting[] = [];
  let skip = 0;
  for (let page = 0; page < 10; page += 1) {
    const url = `${host}/v0/postings/${encodeURIComponent(company.boardId ?? "")}?mode=json&skip=${skip}&limit=100`;
    const batch = await getJson(url, fetchImpl, company);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      const mapped = mapLeverJob(item, company.name);
      if (mapped) postings.push(mapped);
    }
    if (batch.length < 100) break;
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
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  return jobs.flatMap((job) => {
    const mapped = mapAshbyJob(job, company.name);
    return mapped ? [mapped] : [];
  });
}

export function titleLooksRelevant(title: string): boolean {
  const text = title.toLowerCase();
  if (isStudentFacing(text)) return true;
  return /\b(intern|co-op|coop|student|new grad|early career)\b/.test(text);
}

async function getJson(url: string, fetchImpl: typeof fetch, company: WatchCompany): Promise<unknown> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "charliewaghmare-jobs/1.0" },
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
