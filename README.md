# Charlie Waghmare

Personal site for [charliewaghmare.com](https://charliewaghmare.com). It is a Next.js app with a personal homepage, Garmin training views, and a Supabase-backed job discovery board.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

## What to edit

| Change | Where |
| --- | --- |
| Name, about text, and projects | `src/content/site.ts` |
| Résumé PDF | `public/resume.pdf` |
| Personal bests | `src/content/personal-bests.ts` |
| Page layout | `src/app/page.tsx` and `src/components/` |

The About section shows a note until `about` in `src/content/site.ts` has text. Separate paragraphs with a blank line.

View and download buttons stay hidden until `public/resume.pdf` exists. Refresh the local page after you add the file. On Vercel the check runs at build time, so commit the PDF and redeploy before the buttons appear on the live site.

The Projects section stays off the page while `projects` is an empty list. Add an object with a title, a short description, and `href` (the hosted project), `repo` (its GitHub repository), or both.

## Garmin

The homepage has the most recent activity in the top right on a wide screen, and under the name on a phone. It shows distance, time, average pace, average heart rate, and the GPS path with no map behind it. [charliewaghmare.com/training](https://charliewaghmare.com/training) shows the last 30 days of runs, plus training load, load balance, VO2 max, resting heart rate, HRV, readiness, and sleep. Metric cards open historical charts (7 / 30 / 90 days / 1 year) from real Garmin readings when history exists.

Personal bests are not taken from Garmin. Edit `src/content/personal-bests.ts` when you run a new one, then push.

Real data needs an environment variable named `GARMIN_TOKEN`. Its value is the JSON in `~/.garminconnect/garmin_tokens.json` after you sign in with the [Garmin MCP](https://github.com/Taxuspt/garmin_mcp) (`garmin-mcp-auth`). Put that JSON in Vercel under **Settings → Environment Variables** for Production, then redeploy. Do not commit it, and do not paste it into chat.

Until that variable is set, the pages show a labeled sample. A refresh asks Garmin again about once a minute, so visitors are not each calling Garmin.

## Jobs

[charliewaghmare.com/jobs](https://charliewaghmare.com/jobs) is a personal job discovery board backed by Supabase, deterministic eligibility/scoring, daily public ATS collection and community-feed discovery, plus bounded AI web research. Until Supabase is connected, the page shows labeled sample listings with no application links.

### Environment variables

Set these in Vercel for Production. Do not commit them.

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public anon key, used server-side for listing reads under RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for edit-mode writes. Never expose it to the browser |
| `JOBS_EDIT_PIN_HASH` | scrypt hash of the 4-digit PIN |
| `JOBS_SESSION_SECRET` | Random string of at least 16 characters used to sign the edit cookie |

Create the hash locally. Put the PIN in the environment, not in a file you commit:

```bash
JOBS_EDIT_PIN=0000 node scripts/hash-jobs-pin.mjs
```

Replace `0000` with the real PIN for that one command. Copy only the printed hash into `JOBS_EDIT_PIN_HASH`.

Generate a session secret with `openssl rand -base64 32`.

### Database

Apply `supabase/migrations/20261112120000_jobs_phase1.sql` in the Supabase SQL editor. Anonymous visitors can read active jobs and company cards. Saved status, preferences, ignored listings, search notes, and PIN attempts are blocked by row level security. The app checks the edit cookie before using the service role.

PIN attempts are stored in `pin_attempts`. Five failures from one network, or twenty failures overall, lock attempts for 15 minutes.

Edit mode lasts seven days. Lock ends it immediately. Apply `supabase/migrations/20261113040000_jobs_phase4a.sql` so saved jobs keep a saved time for the To Apply shortlist. Until that migration runs, saving still works and the shortlist falls back to the discovery date.

### Collection

Daily collection uses GitHub Actions (`.github/workflows/collect-jobs.yml`). It runs at 6:00 AM America/Vancouver. The workflow checks out this repo and runs `npm run collect`.

Add these GitHub Actions secrets on the repository. Use the same Supabase values as Vercel. Do not print them in logs.

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server key the collector uses to write listings |

Apply `supabase/migrations/20261112200000_jobs_collection.sql` after the Phase 1 migration. Until that runs, the collector cannot save listings.

The collector supports Greenhouse, Lever, Ashby, SmartRecruiters, Workable and public Workday careers JSON. It combines seed boards with enabled boards stored in Supabase. Garmin and Spin Master remain pending. Community candidates are verified through employer APIs or structured data on employer career pages before publication. Verified unfamiliar ATS boards are enrolled automatically; this path uses no AI. See [reliability and operations](docs/jobs-reliability.md).

Manual refresh from the dashboard dispatches that same workflow. It needs two Vercel variables:

| Name | Purpose |
| --- | --- |
| `JOBS_GITHUB_DISPATCH_TOKEN` | GitHub token with permission to dispatch workflows on this repo |
| `JOBS_GITHUB_REPOSITORY` | `charliewaghmare/charliewaghmare.com` |

The button reports that a refresh was requested. It does not wait for new jobs inside the page request. Without the token, the daily Action can still run, and the button says refresh was not started.

When the database is connected, `/jobs` shows stored listings only. Sample cards stay on the page only when Supabase is not configured.

Materials engineering is a high-interest field, alongside mechanical engineering, product development, motorsports, and running technology.

Discovery keeps internships, co-ops, and other roles with positive evidence they are for current students. A full-time weekly schedule does not disqualify a summer internship. Permanent, senior, and lead roles are removed from the active feed and kept in the database so a later run can restore one if the posting itself changes. Run **Collect jobs** again after this change so existing rows are reclassified. The scoring version is `student-rules-v2`. The weights are unchanged. Summer analyst, industrial placement, and undergraduate research titles count as student evidence.

### Research

Research does not run on a timer. It starts only when you search from the unlocked jobs page. That dispatches `.github/workflows/research-jobs.yml`. The workflow uses the OpenAI Responses API with the `web_search` tool (`gpt-6-astra` unless `OPENAI_RESEARCH_MODEL` is set). The selected depth preset allows up to 4 model requests, 8 job verification attempts and 3 company checks/additions. Failed checks consume the verification budget, and depth-specific tool-call limits are passed to the API.

Add these GitHub Actions secrets in addition to the collector secrets:

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key used only by the research workflow |
| `OPENAI_RESEARCH_MODEL` | Optional. Defaults to `gpt-6-astra` |

Apply `supabase/migrations/20261113020000_jobs_research.sql` so query history can be stored. Research still saves jobs if that table is missing; it just cannot remember past queries.

Web search is $10 per 1,000 calls on OpenAI's pricing page, plus model tokens. `gpt-6-astra` short-context rates on that page are $10 per million input tokens and $50 per million output tokens. `gpt-6.1-terra` is $1 and $5. The workflow stores token counts and a dollar figure only when the API returns usage for a model with those published rates. Each model request is limited to 2 web searches, and a run stops near $0.75. Leave `OPENAI_RESEARCH_MODEL` set to the model you chose. A model that is not known to support web search fails the run instead of inventing postings.

The daily collector also reads verified SmartRecruiters boards, Nike's public Workday feed, and additional Greenhouse and Ashby boards that returned student postings. Workable's public API is implemented, but no target employer currently returns jobs from it, so none are monitored. iCIMS, campus login systems, and Handshake are not collected.

The same collection run reads the MIT-licensed `listings.json` from [internship-radar](https://github.com/IS-tib/internship-radar). It treats feed rows as candidates, skips shortened links, and verifies candidates before saving employer evidence. It checks at most 8 unfamiliar/failed/limited ATS boards and 20 custom pages per run, rotating the selection daily. Successful snapshots are reused, and employer records are protected from incoming web records in both collection and research. Simplify's listings file has no license, so it is not imported. This pass does not call a language model.

Unlock `/jobs` and use Custom research on Discover to run one search. Pick Quick, Standard, or Deep. Those are approximate ceilings of $0.10, $0.35, and $0.75. The page records the request and asks GitHub Actions to run `research-jobs.yml` with the query, depth, and run id. Refresh jobs collects employer boards and verifies community-feed candidates without AI. A workflow run with no search text does not call the model.

## Deploy on Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), import the repository. Use the Next.js preset. Add `GARMIN_TOKEN` when you want live training data. The site still builds without it.
3. Deploy. Vercel runs `npm run build`.

Each push to the production branch deploys again. Include `public/resume.pdf` in the repository when you want the résumé buttons on the live site.

## Connect the GoDaddy domain later

Do this after the page looks right on its `*.vercel.app` URL.

1. In the Vercel project, open **Settings → Domains** and add `charliewaghmare.com` and `www.charliewaghmare.com`.
2. Vercel shows the DNS records to create. Use those values. They are usually an **A** record for the apex domain and a **CNAME** for `www`.
3. In GoDaddy, open the domain’s DNS settings. Replace any parking or forwarding records for `@` and `www` with the records from Vercel. Leave the domain’s nameservers at GoDaddy.
4. Wait for DNS to update, then confirm the domain shows as valid in Vercel. Vercel provisions HTTPS after that.

Set whichever hostname you prefer as the primary domain in Vercel, and redirect the other one to it.
