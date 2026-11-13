import { assertPublicHttps, looksExpired, pageText, quoteOnPage, titleOnPage } from "@/lib/jobs/research/safety";

export type PageCheck = { ok: true; text: string } | { ok: false; reason: string };

export async function fetchPublicPage(value: string, fetchImpl: typeof fetch = fetch): Promise<PageCheck> {
  let current = assertPublicHttps(value);
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchImpl(current.toString(), {
      redirect: "manual",
      headers: { accept: "text/html,application/json", "user-agent": "charliewaghmare-jobs/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "Redirect had no destination." };
      current = assertPublicHttps(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) return { ok: false, reason: `Page responded ${response.status}.` };
    const raw = await response.text();
    const text = pageText(raw.slice(0, 500_000));
    if (looksExpired(text)) return { ok: false, reason: "The page says the posting is closed or missing." };
    return { ok: true, text };
  }
  return { ok: false, reason: "Too many redirects." };
}

export function pageSupportsPosting(input: { title: string; quote: string; text: string }): PageCheck {
  if (looksExpired(input.text)) return { ok: false, reason: "The page says the posting is closed or missing." };
  if (!quoteOnPage(input.quote, input.text)) {
    return { ok: false, reason: "The quoted evidence was not on the page." };
  }
  if (!titleOnPage(input.title, input.text)) {
    return { ok: false, reason: "The job title was not on the page." };
  }
  return { ok: true, text: input.text };
}
