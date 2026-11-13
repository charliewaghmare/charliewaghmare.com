import { detectAts } from "@/lib/jobs/research/ats";
import { assessPosting, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl, inferArrangement, inferCountry } from "@/lib/jobs/collect/text";
import type { WatchCompany } from "@/lib/jobs/collect/watchlist";

export const RADAR_LISTINGS_URL = "https://raw.githubusercontent.com/IS-tib/internship-radar/main/listings.json";

const BLOCKED_HOSTS = new Set([
  "go.vansh.nyc",
  "simplify.jobs",
  "bit.ly",
  "tinyurl.com",
  "lnkd.in",
  "t.co",
  "www.linkedin.com",
  "linkedin.com",
]);

export type FeedStats = {
  raw: number;
  closed: number;
  rejectedLink: number;
  duplicateBoard: number;
  ineligible: number;
  uncertain: number;
  geography: number;
  kept: number;
};

export type CommunityBatch = {
  stats: FeedStats;
  results: { company: WatchCompany; postings: CollectedPosting[] }[];
};

export function selectCommunityPostings(
  payload: unknown,
  options: { skipBoards: Set<string>; now?: Date },
): CommunityBatch {
  const stats: FeedStats = {
    raw: 0,
    closed: 0,
    rejectedLink: 0,
    duplicateBoard: 0,
    ineligible: 0,
    uncertain: 0,
    geography: 0,
    kept: 0,
  };
  const grouped = new Map<string, CollectedPosting[]>();
  const listings = listingsFrom(payload);
  const closedList = payload && typeof payload === "object" ? (payload as { closed?: unknown }).closed : null;
  if (Array.isArray(closedList)) stats.closed += closedList.length;
  for (const row of listings) {
    stats.raw += 1;
    if (row.status !== "open") {
      stats.closed += 1;
      continue;
    }
    if (row.level !== "intern" || row.is_phd === true) {
      stats.ineligible += 1;
      continue;
    }
    const url = canonicalCommunityUrl(row.url);
    if (!url) {
      stats.rejectedLink += 1;
      continue;
    }
    const board = detectAts(url);
    if (board && options.skipBoards.has(`${board.provider}:${board.boardId}`)) {
      stats.duplicateBoard += 1;
      continue;
    }
    const posting = toPosting(row, url);
    const assessment = assessPosting(posting, options.now);
    if (!assessment.publish) {
      if (assessment.status === "eligible_student_role") stats.geography += 1;
      else if (assessment.status === "uncertain") stats.uncertain += 1;
      else stats.ineligible += 1;
      continue;
    }
    const bucket = grouped.get(posting.companyName) ?? [];
    bucket.push(posting);
    grouped.set(posting.companyName, bucket);
    stats.kept += 1;
  }
  const results = [...grouped.entries()].map(([name, postings]) => ({
    company: communityCompany(name),
    postings,
  }));
  return { stats, results };
}

export async function loadCommunityFeed(
  skipBoards: Set<string>,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<CommunityBatch> {
  const response = await fetchImpl(RADAR_LISTINGS_URL, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json", "user-agent": "charliewaghmare-jobs/1.0" },
  });
  if (!response.ok) {
    throw new Error(`internship-radar feed failed (${response.status})`);
  }
  return selectCommunityPostings(await response.json(), { skipBoards, now });
}

function listingsFrom(payload: unknown): RadarListing[] {
  if (!payload || typeof payload !== "object") return [];
  const listings = (payload as { listings?: unknown }).listings;
  if (!Array.isArray(listings)) throw new Error("internship-radar payload is missing listings.");
  return listings.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const company = stringValue(row.company);
    const title = stringValue(row.title);
    const url = stringValue(row.url);
    if (!company || !title || !url) return [];
    const posted = row.posted && typeof row.posted === "object" ? (row.posted as Record<string, unknown>) : null;
    return [
      {
        company,
        title,
        url,
        status: stringValue(row.status) ?? "",
        level: stringValue(row.level) ?? "",
        is_phd: row.is_phd === true,
        location: stringValue(row.location_display) ?? stringValue(row.location),
        term: stringValue(row.term),
        term_inferred: row.term_inferred === true,
        posted: stringValue(posted?.value),
        precision: stringValue(posted?.precision),
        identity: stringValue(row.identity),
      },
    ];
  });
}

type RadarListing = {
  company: string;
  title: string;
  url: string;
  status: string;
  level: string;
  is_phd: boolean;
  location: string | null;
  term: string | null;
  term_inferred: boolean;
  posted: string | null;
  precision: string | null;
  identity: string | null;
};

function toPosting(row: RadarListing, url: string): CollectedPosting {
  const location = row.location;
  const country = inferCountry(location);

  const termNote = row.term_inferred
    ? "The feed inferred a term from the posting date, so that term is not treated as verified."
    : row.term
      ? `The feed lists the term as ${row.term}.`
      : "";
  return {
    provider: "web",
    provenance: "internship-radar",
    sourceId: `radar:${(row.identity ?? url).slice(0, 180)}`,
    title: row.title,
    companyName: row.company,
    location,
    country,
    workArrangement: inferArrangement(location, null),
    description: ["Discovered from the internship-radar feed.", termNote, location ? `Location on the feed: ${location}.` : ""]
      .filter(Boolean)
      .join(" "),
    departments: ["internship-radar"],
    sourceUrl: url,
    applicationUrl: url,
    postedOn: row.precision === "exact" || row.precision === "day" ? row.posted : null,
    employmentType: "Internship",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
  };
}

function canonicalCommunityUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".vansh.nyc")) return null;
  if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1") return null;
  return canonicalUrl(url.toString());
}

function communityCompany(name: string): WatchCompany {
  return {
    name,
    website: null,
    careersUrl: null,
    provider: null,
    boardId: null,
    region: "global",
    categories: [],
    geographicRelevance: "From the internship-radar feed",
    enabled: true,
    listingSource: "web",
    why: "A student posting was found on the MIT-licensed internship-radar feed. The application link is the employer URL.",
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
