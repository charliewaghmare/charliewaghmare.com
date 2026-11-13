# Jobs reliability and operations

This change keeps the existing dashboard, application tracking, eligibility policy, six ATS connectors, Supabase schema and GitHub schedules. It adds no dependencies, paid services, AI scoring or new AI spending limits. No production database writes were performed during implementation.

## Ingestion safeguards

- Collection and research use the same job-write function. Employer records cannot be overwritten by weaker web records. Suppression checks use both source identity and canonical URL.
- Matching title/employer/location is no longer sufficient to merge requisitions. Exact source identities or canonical URLs are required. Cross-employer source-ID collisions and conflicting existing records fail with an explicit diagnostic instead of overwriting tracking history.
- Only complete employer snapshots advance missing-job counters. Failed or capped listings, Workday keyword searches and community subsets cannot establish closure. The full-board sources still use the existing two-miss policy.
- Malformed ATS payloads fail instead of looking like empty boards. Fetches have timeouts; public HTML verification limits response size and validates redirects/public addresses.
- Persisted ATS metadata is retained when a candidate has no board information. Disabled stored boards stay disabled. Dynamically discovered boards are included in coverage counts.
- Collection records its run before fetching sources. Database identity/suppression failures stop writes. Reclassification skips unchanged rows; company opening flags use paginated active-job reads instead of one count query per employer.
- Work-term filtering expires seasons at their end, country codes normalize before geography checks, and student-title recognition is shared with detail enrichment.
- Explicit custom-search international scope is stored and preserved during later collection and reclassification. Saved/applied status and notes remain in the existing separate tracking table.

## Company-agnostic discovery

The existing MIT-licensed internship-radar feed remains the only community feed. Its rows now generate verification candidates rather than directly becoming verified jobs. Candidate selection rotates deterministically by date.

Each collection explores at most eight ATS boards and twenty non-ATS pages. Board checks can issue pagination/detail requests, so eight checks does not mean eight HTTP requests. Successful current snapshots are reused. Failed known boards can be retried, and specific postings outside limited board snapshots can be fetched directly where supported. A previously unknown board is enrolled only after its API independently confirms the candidate URL. Subsequent runs collect its student openings without AI.

Non-ATS candidates require `JobPosting` JSON-LD, a matching visible title, employer identity/domain evidence, current expiry information when supplied, and independently eligible description/title/employment data. Feed employment labels do not establish eligibility for the verified record. JS-only, blocked and insufficiently evidenced pages remain unverified.

Scheduled AI research remains disabled, matching the updated main branch. Live research still requires an explicit dashboard search and keeps its existing budget presets. The non-custom planner has a 21-day query-history cooldown instead of exhausting the finite query pool forever; it is not used by scheduled production runs while those remain disabled. Its work-term years roll forward. Duplicate URLs are screened across the whole run, failed checks consume the verification budget, depth tool-call limits reach the provider request, and malformed model outputs retain returned usage for cost accounting. Company board enrollment requires links from verified employer pages rather than trusting model-supplied board hints.

There is still no conventional search API adapter. Adding one with a paid plan or recurring cost requires owner approval. Broader Canadian engineering/manufacturing feeds and an approved search API remain the next coverage improvements.

## Read-only inventory audit

With existing Supabase environment variables in the shell:

```sh
npm run audit:jobs -- --verify --output /tmp/jobs-inventory-review.json
```

Or provide a JSON array exported from the jobs database or the public dashboard model:

```sh
npm run audit:jobs -- --input /tmp/jobs-inventory.json --verify --output /tmp/jobs-inventory-review.json
```

Without `--verify`, the command assesses stored eligibility only. It never calls a language model and contains no database mutation. Verification shares board snapshots between jobs and uses at most four concurrent job checks. Output distinguishes `verified_student`, `ineligible`, `not_on_complete_board`, and `unverified`. It is evidence for review, not an automatic deletion plan.

The 2026-11-12 Vancouver snapshot contains 142 publicly listed jobs across 54 employers: 113 independently verified relevant student roles, 13 absent from complete current employer boards, 2 outside the default international-interest policy, and 14 unresolved. Per-job evidence is in [the inventory review](jobs-inventory-review.json). The public export omits custom-search scope metadata, so the two default-policy exclusions need a private metadata check before changing their status. Source checks cannot establish personal work authorization or all academic requirements.

A live collection dry run checked 45 source groups without source failures, fetched 6,981 postings and assessed 115 as eligible/relevant. These are fetched/assessed counts, not newly inserted or unique production jobs. The feed independently added verified boards for Astera Labs, Intuitive Surgical, Saronic and Anduril beyond the static seeds. No AI calls or database writes occurred.

## Validation and release

Run `npm run test:jobs`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. All 52 jobs tests pass. TypeScript, lint and whitespace checks pass. Tests include persistence/suppression/lifecycle regressions, custom geography, failed-source handling, query cooldown, deterministic discovery, verification limits and the read-only auditor.

The normal Turbopack build was attempted but its CSS worker socket was blocked by the local execution environment. `npm run build -- --webpack` completed a production build, including TypeScript and all route generation. Recheck the normal build in the deployment/CI environment; the repository build configuration has not been changed.

No database migration or new secret is required. Production deployment and production inventory cleanup remain separate owner approvals. Review the inventory findings, recheck sources and private scope metadata, and approve any status changes explicitly before applying them. Retain jobs and tracking history; do not delete records to clean the feed.

Known limitations: capped/keyword ATS sources need explicit posting rechecks for closure; some custom career pages require browser rendering; legacy feed records are not automatically certified by this change; legacy cross-source aliases can remain duplicates; saved preferences still do not configure backend scoring weights; provider cost estimates remain approximate; simultaneous workflow writes are not protected by a global database lease. A later scoped change should address recurring web-posting verification and canonical requisition aliases before scaling ingestion substantially.
