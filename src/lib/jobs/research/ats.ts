export type AtsHit = { provider: "greenhouse" | "lever" | "ashby"; boardId: string };

export function detectAts(value: string | null | undefined): AtsHit | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segment = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
  if (!segment || !/^[a-z0-9_-]{2,80}$/i.test(segment)) return null;
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    return { provider: "greenhouse", boardId: segment };
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    return { provider: "lever", boardId: segment };
  }
  if (host === "jobs.ashbyhq.com") return { provider: "ashby", boardId: segment };
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
