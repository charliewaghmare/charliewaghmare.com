export type WorkArrangement = "onsite" | "hybrid" | "remote";

export type ApplicationStage =
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export type ScoreBreakdown = {
  interest: number;
  location: number;
  qualifications: number;
  career: number;
  compensation: number;
};

export type ScoreBand = "exceptional" | "strong" | "potential" | "low";

export type JobListing = {
  id: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  title: string;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string;
  workArrangement: WorkArrangement;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  skills: string[];
  salaryLabel: string | null;
  employmentType: string;
  workTerm: string;
  postedOn: string | null;
  discoveredOn: string;
  lastVerifiedOn: string | null;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  recommendation: string;
  skillGaps: string[];
  deadline: string | null;
  tags: string[];
  isSample: boolean;
  persisted: boolean;
  saved: boolean;
  applied: boolean;
  appliedOn: string | null;
  stage: ApplicationStage | null;
  notes: string | null;
  lifecycleStatus?: "active" | "stale" | "closed" | null;
  country?: string | null;
  scoringVersion?: string | null;
  authorizationNote?: string | null;
  inDiscovery?: boolean;
};

export type CompanyTarget = {
  id: string;
  name: string;
  industry: string;
  location: string;
  website: string | null;
  careersUrl: string | null;
  logoUrl: string | null;
  why: string;
  hasVerifiedOpening: boolean;
  isSample: boolean;
  monitoringStatus?: string | null;
  lastCheckedAt?: string | null;
  atsProvider?: string | null;
};

export type InterestLevel = "high" | "medium";

export type InterestCategory = {
  id: string;
  label: string;
  level: InterestLevel;
};

export type SearchPreferences = {
  weights: {
    interest: number;
    location: number;
    qualifications: number;
    career: number;
    compensation: number;
  };
  interests: InterestCategory[];
  boosts: string[];
  locations: {
    ideal: string[];
    good: string[];
    remote: string[];
    exceptionalOnly: string[];
  };
  workTerms: string[];
  minScore: number;
  strategy: string;
  feedbackAdaptation: string;
  qualificationApproach: string;
};

export type IgnoredJob = {
  id: string;
  jobId: string | null;
  title: string;
  companyName: string;
  source: string;
  sourceId: string | null;
  suppressedAt: string;
};

export type StoredSearch = {
  id: string;
  prompt: string;
  createdAt: string;
  status: string;
};

export type CollectionStatus = {
  status: string;
  startedAt: string;
  completedAt: string | null;
  detail: string | null;
};

export type JobsPageModel = {
  source: "sample" | "database";
  note: string | null;
  jobs: JobListing[];
  companies: CompanyTarget[];
  preferences: SearchPreferences | null;
  ignored: IgnoredJob[];
  customSearches: StoredSearch[];
  lastSuccessfulRefresh: string | null;
  collection: CollectionStatus | null;
  databaseConfigured: boolean;
  pinConfigured: boolean;
};

export function scoreBand(score: number): { id: ScoreBand; label: string } {
  if (score >= 90) return { id: "exceptional", label: "Exceptional match" };
  if (score >= 75) return { id: "strong", label: "Strong match" };
  if (score >= 50) return { id: "potential", label: "Potential match" };
  return { id: "low", label: "Low match" };
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
