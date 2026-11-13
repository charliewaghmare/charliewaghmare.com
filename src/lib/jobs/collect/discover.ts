import { createHash } from "node:crypto";
import { fetchBoard, fetchPosting } from "@/lib/jobs/collect/fetch-source";
import { detectAts, atsPostingIdentity } from "@/lib/jobs/research/ats";
import { fetchPublicPage } from "@/lib/jobs/research/verify";
import { structuredPosting } from "@/lib/jobs/research/structured";
import { canonicalUrl } from "@/lib/jobs/collect/text";
import { assessPosting } from "@/lib/jobs/collect/rules";
import type { CommunityBatch } from "@/lib/jobs/collect/community";
import type { SourceResult } from "@/lib/jobs/collect/persist";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

/** Free feed discovery. Reuse today's snapshots; rotate bounded exploration of unknown boards. */
export async function discoverCommunity(
  feed: CommunityBatch,
  collected: SourceResult[],
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<{ results: SourceResult[]; diagnostics: string[] }> {
  const results: SourceResult[] = [];
  const diagnostics: string[] = [];
  const snapshots = new Map<string, SourceResult>(collected.flatMap((result) => result.company.provider && result.company.boardId
    ? [[`${result.company.provider}:${result.company.boardId}`, result] as const] : []));
  const knownUrls = new Set(collected.flatMap((result) => result.postings.map((posting) => canonicalUrl(posting.sourceUrl))));
  const candidates = feed.results.flatMap((result) => result.postings);
  const day = now.toISOString().slice(0, 10);
  const rank = (key: string) => createHash("sha256").update(`${day}:${key}`).digest("hex");
  // Rotation prevents the same large employer or first feed rows consuming every run.
  candidates.sort((a, b) => rank(a.sourceId).localeCompare(rank(b.sourceId)));
  let newBoards = 0;
  let pages = 0;
  const attempted = new Set<string>();
  for (const candidate of candidates) {
    const url = canonicalUrl(candidate.sourceUrl);
    if (!url || knownUrls.has(url)) continue;
    const board = detectAts(url);
    if (board) {
      const key = `${board.provider}:${board.boardId}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const previous = snapshots.get(key);
      // Successful complete snapshots already contain every available posting.
      if (previous?.ok && previous.complete) continue;
      // Retry a failed known board once, or explore an unknown board within the free HTTP budget.
      if (newBoards >= 8) continue;
      newBoards += 1;
      const company: WatchCompany = {
        name: previous?.company.name ?? candidate.companyName, website: previous?.company.website ?? null,
        careersUrl: `https://${new URL(url).hostname}/${board.provider === "workday" ? board.boardId.split("/")[2] : encodeURIComponent(board.boardId)}`,
        provider: board.provider, boardId: board.boardId,
        region: new URL(url).hostname === "jobs.eu.lever.co" ? "eu" : "global",
        categories: [], geographicRelevance: candidate.location ?? "",
        enabled: true, why: "Employer board discovered from an internship-radar posting and verified through its public API.",
      };
      try {
        const snapshot = { complete: false };
        const postings = previous?.ok ? [...previous.postings] : await fetchBoard(company, fetchImpl, snapshot);
        if (previous?.ok) snapshot.complete = previous.complete === true;
        if (!postings.some((posting) => canonicalUrl(posting.sourceUrl) === url || canonicalUrl(posting.applicationUrl) === url ||
          (atsPostingIdentity(url) !== null && atsPostingIdentity(posting.sourceUrl) === atsPostingIdentity(url)))) {
          const direct = await fetchPosting(company, url, fetchImpl);
          if (direct && !postings.some((posting) => posting.sourceId === direct.sourceId)) postings.push(direct);
        }
        // Only enroll a board when it independently confirms the feed's claimed opening.
        if (!postings.some((posting) => canonicalUrl(posting.sourceUrl) === url || canonicalUrl(posting.applicationUrl) === url ||
          (atsPostingIdentity(url) !== null && atsPostingIdentity(posting.sourceUrl) === atsPostingIdentity(url)))) {
          diagnostics.push(`${company.name}: feed URL not confirmed by board; not enrolled.`);
          continue;
        }
        const result = { company, ok: true, error: null, postings, complete: snapshot.complete };
        results.push(result);
        for (const posting of postings) knownUrls.add(canonicalUrl(posting.sourceUrl));
      } catch (error) {
        diagnostics.push(`${company.name}: ${error instanceof Error ? error.message : "board verification failed"}`);
      }
      continue;
    }
    if (pages >= 20) continue;
    pages += 1;
    try {
      const page = await fetchPublicPage(url, fetchImpl);
      if (!page.ok) { diagnostics.push(`${candidate.companyName}: ${page.reason}`); continue; }
      const posting = structuredPosting({ html: page.html ?? "", visibleText: page.text, url: page.url ?? url, title: candidate.title, employer: candidate.companyName, now });
      if (!posting || !assessPosting(posting, now).publish) {
        diagnostics.push(`${candidate.companyName}: employer page did not independently establish an eligible student posting.`);
        continue;
      }
      posting.sourceId = `page:${createHash("sha256").update(posting.sourceUrl ?? url).digest("hex").slice(0, 24)}`;
      results.push({ company: { name: posting.companyName, website: new URL(page.url ?? url).origin,
        careersUrl: null, provider: null, boardId: null, region: "global", categories: [],
        geographicRelevance: posting.location ?? "", enabled: true, listingSource: "web",
        why: "Internship verified against structured data and visible text on the employer's own domain." },
      ok: true, error: null, postings: [posting], complete: false });
      knownUrls.add(url);
    } catch (error) {
      diagnostics.push(`${candidate.companyName}: ${error instanceof Error ? error.message : "page verification failed"}`);
    }
  }
  diagnostics.push(`Feed verification: ${newBoards} board checks, ${pages} page checks, ${results.length} verified source results; no AI calls.`);
  return { results, diagnostics };
}
