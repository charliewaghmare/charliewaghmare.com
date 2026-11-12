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
