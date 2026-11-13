export function stripHtml(value: string): string {
  const withoutTags = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function isTrackingParam(key: string): boolean {
  return /^(utm_|gh_src$|ref$|source$|lever-source$)/i.test(key);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const kept = [...url.searchParams.entries()].filter(([key]) => !isTrackingParam(key));
    kept.sort(([left], [right]) => left.localeCompare(right));
    url.search = "";
    for (const [key, param] of kept) url.searchParams.append(key, param);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const query = url.searchParams.toString();
    return `${url.protocol}//${url.hostname}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

export function inferCountry(location: string | null): string | null {
  if (!location) return null;
  const value = location.toLowerCase();
  if (
    /\b(canada|toronto|vancouver|mississauga|ottawa|montreal|montréal|calgary|edmonton|ontario|british columbia|quebec|québec|collingwood|owen sound|gta)\b/.test(
      value,
    )
  ) {
    return "Canada";
  }
  if (/,\s*(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)\b/.test(value)) return "Canada";
  if (
    /\b(united states|u\.s\.a\.|usa)\b/.test(value) ||
    /,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy|dc)\b/.test(
      value,
    )
  ) {
    return "United States";
  }
  if (/\b(united kingdom|uk|london|england)\b/.test(value)) return "United Kingdom";
  return null;
}

export function inferArrangement(
  location: string | null,
  workplace: string | null,
): "onsite" | "hybrid" | "remote" | null {
  const value = `${workplace ?? ""} ${location ?? ""}`.toLowerCase();
  if (value.includes("hybrid")) return "hybrid";
  if (value.includes("remote")) return "remote";
  if (value.includes("on-site") || value.includes("onsite") || value.includes("in-office")) {
    return "onsite";
  }
  return null;
}
