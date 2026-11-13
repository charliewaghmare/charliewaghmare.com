import { fetchBoard, fetchPosting } from "@/lib/jobs/collect/fetch-source";
import { assessPosting, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl } from "@/lib/jobs/collect/text";
import { watchlist, type WatchCompany } from "@/lib/jobs/collect/watchlist";
import { detectAts, atsPostingIdentity } from "@/lib/jobs/research/ats";
import { fetchPublicPage } from "@/lib/jobs/research/verify";
import { structuredPosting } from "@/lib/jobs/research/structured";

export type InventoryItem = { id: string; posting: CollectedPosting };
export type InventoryVerdict = {
  id: string; employer: string; title: string; url: string | null;
  verdict: "verified_student" | "ineligible" | "not_on_complete_board" | "unverified";
  reason: string; score: number;
};

/** Read-only: verification never writes a job, status, suppression or company. */
export async function auditInventory(items: InventoryItem[], options: {
  verify?: boolean; fetchImpl?: typeof fetch; now?: Date;
} = {}): Promise<InventoryVerdict[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const boards = new Map<string, Promise<{ postings: CollectedPosting[]; complete: boolean }>>();
  const audit = async ({ id, posting }: InventoryItem): Promise<InventoryVerdict> => {
    const base = { id, employer: posting.companyName, title: posting.title, url: posting.sourceUrl };
    const stored = assessPosting(posting, now);
    if (!options.verify) return { ...base, verdict: stored.publish ? "unverified" : "ineligible", reason: stored.publish ? "Stored eligibility passes; source not checked." : stored.reason, score: stored.score };
    const board = detectAts(posting.sourceUrl) ?? (() => {
      const company = watchlist.find((item) => item.name === posting.companyName);
      return company?.provider && company.boardId ? { provider: company.provider, boardId: company.boardId } : null;
    })();
    try {
      let live: CollectedPosting | null = null;
      if (board) {
        const key = `${board.provider}:${board.boardId}`;
        if (!boards.has(key)) {
          const company: WatchCompany = { name: posting.companyName, website: null, careersUrl: posting.sourceUrl,
            ...board, region: posting.sourceUrl?.includes("jobs.eu.lever.co") ? "eu" : "global", categories: [], geographicRelevance: "", enabled: true, why: "Read-only inventory audit" };
          boards.set(key, (async () => {
            const snapshot = { complete: false };
            const postings = await fetchBoard(company, fetchImpl, snapshot);
            return { postings, complete: snapshot.complete };
          })());
        }
        const snapshot = await boards.get(key)!;
        live = snapshot.postings.find((item) =>
          (item.provider === posting.provider && item.sourceId === posting.sourceId) ||
          (Boolean(item.sourceUrl) && canonicalUrl(item.sourceUrl) === canonicalUrl(posting.sourceUrl)) ||
          (atsPostingIdentity(posting.sourceUrl) !== null && atsPostingIdentity(item.sourceUrl) === atsPostingIdentity(posting.sourceUrl)) ||
          (Boolean(item.applicationUrl) && canonicalUrl(item.applicationUrl) === canonicalUrl(posting.applicationUrl))) ?? null;
        if (!live && !snapshot.complete && posting.sourceUrl) {
          live = await fetchPosting({ name: posting.companyName, website: null, careersUrl: posting.sourceUrl, ...board,
            region: posting.sourceUrl.includes("jobs.eu.lever.co") ? "eu" : "global", categories: [], geographicRelevance: "", enabled: true, why: "Read-only direct verification" }, posting.sourceUrl, fetchImpl);
        }
        if (!live) return { ...base, verdict: snapshot.complete ? "not_on_complete_board" : "unverified", reason: snapshot.complete ? "Posting absent from a complete current employer snapshot." : "Posting not found in a limited snapshot; closure is not established.", score: 0 };
      } else {
        if (!posting.sourceUrl) throw new Error("No source URL.");
        const page = await fetchPublicPage(posting.sourceUrl, fetchImpl);
        if (!page.ok) return { ...base, verdict: "unverified", reason: page.reason, score: 0 };
        live = structuredPosting({ html: page.html ?? "", visibleText: page.text, url: page.url ?? posting.sourceUrl,
          title: posting.title, employer: posting.companyName, now, allowInternational: posting.allowInternational });
        if (!live) return { ...base, verdict: "unverified", reason: "Employer ownership and student placement were not independently confirmed.", score: 0 };
      }
      const assessment = assessPosting({ ...live, allowInternational: posting.allowInternational }, now);
      return { ...base, verdict: assessment.publish ? "verified_student" : "ineligible", reason: assessment.reason, score: assessment.score };
    } catch (error) {
      return { ...base, verdict: "unverified", reason: error instanceof Error ? error.message : "Source failed", score: 0 };
    }
  };
  const output = new Array<InventoryVerdict>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await audit(items[index]); }
  }));
  return output;
}
