import type { JobListing, WorkArrangement } from "@/lib/jobs/types";

export type JobSort = "score" | "discovered" | "posted" | "company";

export type JobFilters = {
  query: string;
  tag: string;
  location: string;
  term: string;
  arrangement: WorkArrangement | "any";
  minScore: number;
  sort: JobSort;
};

export const defaultJobFilters: JobFilters = {
  query: "",
  tag: "any",
  location: "any",
  term: "any",
  arrangement: "any",
  minScore: 50,
  sort: "score",
};

export function filterJobs(jobs: JobListing[], filters: JobFilters): JobListing[] {
  const query = filters.query.trim().toLowerCase();
  const matched = jobs.filter((job) => {
    if (job.matchScore < filters.minScore) return false;
    if (filters.tag !== "any" && !job.tags.includes(filters.tag)) return false;
    if (filters.location !== "any" && job.location !== filters.location) return false;
    if (filters.term !== "any" && job.workTerm !== filters.term) return false;
    if (filters.arrangement !== "any" && job.workArrangement !== filters.arrangement) return false;
    if (!query) return true;
    const haystack = [
      job.title,
      job.companyName,
      job.location,
      job.description,
      job.tags.join(" "),
      job.skills.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  return matched.sort((a, b) => compareJobs(a, b, filters.sort));
}

function compareJobs(a: JobListing, b: JobListing, sort: JobSort): number {
  if (sort === "company") return a.companyName.localeCompare(b.companyName) || b.matchScore - a.matchScore;
  if (sort === "discovered") return b.discoveredOn.localeCompare(a.discoveredOn) || b.matchScore - a.matchScore;
  if (sort === "posted") {
    const aPosted = a.postedOn ?? "";
    const bPosted = b.postedOn ?? "";
    return bPosted.localeCompare(aPosted) || b.matchScore - a.matchScore;
  }
  return b.matchScore - a.matchScore || b.discoveredOn.localeCompare(a.discoveredOn);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
