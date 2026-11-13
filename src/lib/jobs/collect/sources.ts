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
    id: "handshake-linkedin",
    reason: "These sites require an account. Aggregator pages are not treated as proof a role is still open.",
  },
  {
    id: "job-bank-and-jobs-gc",
    reason: "No unauthenticated posting API was confirmed, so those listings are not imported.",
  },
] as const;
