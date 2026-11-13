/**
 * Sources are listed here only after a public endpoint returned real postings,
 * or after a check showed why it cannot be collected.
 */
export const supportedSources = [
  {
    id: "greenhouse",
    access: "Public board API",
    note: "boards-api.greenhouse.io",
  },
  {
    id: "lever",
    access: "Public postings API",
    note: "api.lever.co and api.eu.lever.co",
  },
  {
    id: "ashby",
    access: "Public job-board API",
    note: "api.ashbyhq.com/posting-api",
  },
  {
    id: "smartrecruiters",
    access: "Public postings API",
    note: "Verified with ASICS, Continental, Williams Racing, COROS, and Red Bull.",
  },
  {
    id: "workday",
    access: "Public careers JSON used by the employer's own site",
    note: "Verified for Nike at nike.wd1.myworkdayjobs.com. Other employers stay pending until their host, tenant, and site are confirmed.",
  },
  {
    id: "internship-radar",
    access: "MIT-licensed public listings.json",
    note: "IS-tib/internship-radar. Only direct employer HTTPS links are kept. Shortened links are dropped. Boards already on the watchlist are left to the employer API.",
  },
  {
    id: "workable",
    access: "Public jobs API",
    note: "The v3 account endpoint returns postings. None of the target employers exposed a board with jobs, so none are monitored.",
  },
] as const;

export const unsupportedSources = [
  {
    id: "icims",
    reason: "The public search URL that was checked did not return a JSON feed. No employer is collected from iCIMS.",
  },
  {
    id: "university-coop-portals",
    reason: "WaterlooWorks and similar campus systems require a student login. That login is not bypassed.",
  },
  {
    id: "simplify-listings",
    reason: "SimplifyJobs/Summer2027-Internships publishes listings.json but has no license. Those rows are not copied into this board.",
  },
  {
    id: "vanshb03-short-links",
    reason: "vanshb03/Summer2027-Internships is MIT-licensed, but its application links are go.vansh.nyc shorteners. Those are not stored as employer application URLs.",
  },
  {
    id: "handshake-linkedin",
    reason: "These sites require an account. Aggregator pages are not treated as proof a role is still open.",
  },
  {
    id: "job-bank-and-jobs-gc",
    reason: "No unauthenticated posting API was confirmed, so those listings are not imported.",
  },
] as const;
