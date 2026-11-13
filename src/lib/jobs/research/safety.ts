export function assertPublicHttps(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs can be fetched.");
  if (url.username || url.password) throw new Error("URLs with credentials are not fetched.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "0.0.0.0"
  ) {
    throw new Error("That host is not a public job page.");
  }
  if (isPrivateIp(host)) throw new Error("That address is not a public job page.");
  return url;
}

function isPrivateIp(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksExpired(text: string): boolean {
  return /\b(no longer available|position has been filled|job (has expired|is closed|not found)|this job has expired|page not found)\b/i.test(
    text,
  );
}

export function titleOnPage(title: string, text: string): boolean {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((word) => word.length > 3);
  if (words.length === 0) return false;
  const haystack = text.toLowerCase();
  const hits = words.filter((word) => haystack.includes(word));
  return hits.length >= Math.min(2, words.length);
}

export function quoteOnPage(quote: string, text: string): boolean {
  const needle = quote.toLowerCase().replace(/\s+/g, " ").trim();
  return text.toLowerCase().replace(/\s+/g, " ").includes(needle);
}
