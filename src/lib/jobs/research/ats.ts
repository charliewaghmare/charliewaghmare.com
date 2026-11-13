export type AtsHit = {
  provider: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "workday";
  boardId: string;
};

export function detectAts(value: string | null | undefined): AtsHit | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let segment: string;
  try { segment = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? ""); } catch { return null; }
  if (!segment || !/^[a-z0-9_-]{2,80}$/i.test(segment)) return null;
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    return { provider: "greenhouse", boardId: segment };
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    return { provider: "lever", boardId: segment };
  }
  if (host === "jobs.ashbyhq.com") return { provider: "ashby", boardId: segment };
  if (host === "jobs.smartrecruiters.com") return { provider: "smartrecruiters", boardId: segment };
  if (host === "apply.workable.com") return { provider: "workable", boardId: segment };
  if (host.endsWith(".myworkdayjobs.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const site = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0]) ? parts[1] : parts[0];
    const tenant = host.split(".")[0];
    if (!site || !tenant) return null;
    return { provider: "workday", boardId: `${host}/${tenant}/${site}` };
  }
  return null;
}

export function sameCompany(left: { name: string; website: string | null }, right: { name: string; website: string | null }): boolean {
  if (normalizeName(left.name) === normalizeName(right.name)) return true;
  const leftHost = hostOf(left.website);
  const rightHost = hostOf(right.website);
  return Boolean(leftHost && rightHost && leftHost === rightHost);
}

export function sameRequisition(
  left: { company: string; title: string; location: string | null },
  right: { company: string; title: string; location: string | null },
): boolean {
  return (
    normalizeName(left.company) === normalizeName(right.company) &&
    normalizeName(left.title) === normalizeName(right.title) &&
    normalizeName(left.location ?? "") === normalizeName(right.location ?? "")
  );
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Stable identity for supported ATS posting URLs; board/search pages have none. */
export function atsPostingIdentity(value: string | null | undefined): string | null {
  const board = detectAts(value);
  if (!board || !value) return null;
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  let jobId: string | undefined;
  if (board.provider === "greenhouse") jobId = parts[parts.indexOf("jobs") + 1];
  else if (board.provider === "workable") jobId = parts[parts.indexOf("j") + 1];
  else if (board.provider === "workday") jobId = parts.includes("job") ? parts.at(-1) : undefined;
  else jobId = parts[1];
  if (!jobId || jobId === board.boardId) return null;
  if (board.provider === "smartrecruiters") jobId = jobId.split("-")[0];
  return `${board.provider}:${board.boardId}:${jobId}`;
}
