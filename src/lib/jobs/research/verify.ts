import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertPublicHttps, looksExpired, pageText, quoteOnPage, titleOnPage } from "@/lib/jobs/research/safety";

export type PageCheck = { ok: true; text: string; html?: string; url?: string } | { ok: false; reason: string };

export async function fetchPublicPage(value: string, fetchImpl: typeof fetch = fetch): Promise<PageCheck> {
  let current = assertPublicHttps(value);
  for (let hop = 0; hop < 3; hop += 1) {
    if (fetchImpl === fetch) {
      const addresses = await lookup(current.hostname, { all: true });
      if (addresses.length === 0) throw new Error("The host did not resolve.");
      for (const address of addresses) {
        if (isIP(address.address) === 6) {
          if (/^(::|fc|fd|fe80)/i.test(address.address)) throw new Error("The host resolved to a non-public address.");
        } else assertPublicHttps(`https://${address.address}`);
      }
    }
    const response = await fetchImpl(current.toString(), {
      signal: AbortSignal.timeout(20_000),
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
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 500_000) { await reader.cancel(); return { ok: false, reason: "Page exceeded the verification size limit." }; }
        chunks.push(value);
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const text = pageText(raw);
    if (looksExpired(text)) return { ok: false, reason: "The page says the posting is closed or missing." };
    return { ok: true, text, html: raw, url: current.toString() };
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
