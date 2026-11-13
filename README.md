# Charlie Waghmare

Personal site for [charliewaghmare.com](https://charliewaghmare.com). It is a small Next.js app: one landing page, plain TypeScript content, and no database or authentication.

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

[charliewaghmare.com/jobs](https://charliewaghmare.com/jobs) is a personal job discovery board. Phase 1 is the dashboard, PIN edit mode, and Supabase schema. It does not search the web or score live postings. Until Supabase is connected, the page shows labeled sample listings with no application links.

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

Edit mode lasts seven days. Lock ends it immediately. Custom search notes are stored only. They do not research the web.

### Collection

Daily collection uses GitHub Actions (`.github/workflows/collect-jobs.yml`). It runs at 6:00 AM America/Vancouver. The workflow checks out this repo and runs `npm run collect`.

Add these GitHub Actions secrets on the repository. Use the same Supabase values as Vercel. Do not print them in logs.

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server key the collector uses to write listings |

Apply `supabase/migrations/20261112200000_jobs_collection.sql` after the Phase 1 migration. Until that runs, the collector cannot save listings.

The active boards are the Greenhouse, Lever, and Ashby identifiers that were checked against the public APIs. Nike, ASICS, Garmin, and Spin Master stay on the watchlist as pending because they do not have one of those verified boards. The collector does not scrape Workday or career HTML.

Manual refresh from the dashboard dispatches that same workflow. It needs two Vercel variables:

| Name | Purpose |
| --- | --- |
| `JOBS_GITHUB_DISPATCH_TOKEN` | GitHub token with permission to dispatch workflows on this repo |
| `JOBS_GITHUB_REPOSITORY` | `charliewaghmare/charliewaghmare.com` |

The button reports that a refresh was requested. It does not wait for new jobs inside the page request. Without the token, the daily Action can still run, and the button says refresh was not started.

When the database is connected, `/jobs` shows stored listings only. Sample cards stay on the page only when Supabase is not configured.

Materials engineering is a high-interest field, alongside mechanical engineering, product development, motorsports, and running technology.

Discovery keeps internships, co-ops, and other roles with positive evidence they are for current students. A full-time weekly schedule does not disqualify a summer internship. Permanent, senior, and lead roles are removed from the active feed and kept in the database so a later run can restore one if the posting itself changes. Run **Collect jobs** again after this change so existing rows are reclassified. The scoring version is `phase3a-rules-v1`.

### Research

Twice a week, GitHub Actions runs `.github/workflows/research-jobs.yml` at 6:00 AM America/Vancouver on Tuesday and Friday. It uses the OpenAI Responses API with the `web_search` tool (`gpt-6-astra` unless `OPENAI_RESEARCH_MODEL` is set). A run is limited to 4 searches, 8 page checks, and 3 new companies.

Add these GitHub Actions secrets in addition to the collector secrets:

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key used only by the research workflow |
| `OPENAI_RESEARCH_MODEL` | Optional. Defaults to `gpt-6-astra` |

Apply `supabase/migrations/20261113020000_jobs_research.sql` so query history can be stored. Research still saves jobs if that table is missing; it just cannot remember past queries.

Web search is $10 per 1,000 calls on OpenAI's pricing page, plus model tokens. `gpt-6-astra` short-context rates on that page are $10 per million input tokens and $50 per million output tokens. The workflow stores token counts and a dollar figure only when the API returns usage for a model with those published rates.

The dashboard does not start research. Run the workflow manually for a one-off search, and pass the `query` input when you want a single topic. Custom search notes on the page are still not executed.

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
