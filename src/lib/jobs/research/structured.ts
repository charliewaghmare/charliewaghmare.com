import { stripHtml, inferArrangement, inferCountry, normalizeCountry, canonicalUrl } from "@/lib/jobs/collect/text";
import { assessPosting, type CollectedPosting } from "@/lib/jobs/collect/rules";
import { titleOnPage } from "@/lib/jobs/research/safety";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/** JSON-LD is evidence, not authority: also require the role in visible page text. */
export function structuredPosting(input: {
  html: string; visibleText: string; url: string; title: string; employer: string; now?: Date; allowInternational?: boolean;
}): CollectedPosting | null {
  const nodes: Row[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const item = row(value);
    if (item["@type"] === "JobPosting" || (Array.isArray(item["@type"]) && item["@type"].includes("JobPosting"))) nodes.push(item);
    if (item["@graph"]) visit(item["@graph"]);
  };
  for (const match of input.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* A bad block must not hide other blocks. */ }
  }
  for (const item of nodes) {
    const title = text(item.title);
    const description = stripHtml(text(item.description) ?? "");
    const organization = row(item.hiringOrganization);
    const name = text(organization.name);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!title || !name || normalize(name) !== normalize(input.employer)) continue;
    if (!titleOnPage(input.title, title) || !titleOnPage(title, input.visibleText)) continue;
    const website = canonicalUrl(text(organization.sameAs) ?? text(organization.url));
    // Custom domains must identify their employer on that same domain.
    if (!website) continue;
    const employerHost = new URL(website).hostname.replace(/^www\./, "");
    const pageHost = new URL(input.url).hostname.replace(/^www\./, "");
    if (pageHost !== employerHost && !pageHost.endsWith(`.${employerHost}`)) continue;
    if (typeof item.validThrough === "string") {
      const expiry = Date.parse(item.validThrough);
      if (Number.isFinite(expiry) && expiry < (input.now ?? new Date()).getTime()) continue;
    }
    const place = row(Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation);
    const address = row(place.address);
    const location = [text(address.addressLocality), text(address.addressRegion), text(address.addressCountry) ?? text(row(address.addressCountry).name)].filter(Boolean).join(", ") || null;
    const posting: CollectedPosting = {
      provider: "web", sourceId: input.url, sourceUrl: input.url, applicationUrl: input.url,
      title, companyName: name, description, location,
      country: normalizeCountry(text(address.addressCountry) ?? text(row(address.addressCountry).name)) ?? inferCountry(location),
      workArrangement: inferArrangement(location, text(item.jobLocationType)), departments: [],
      postedOn: /^\d{4}-\d{2}-\d{2}/.test(String(item.datePosted)) ? String(item.datePosted).slice(0, 10) : null,
      employmentType: text(item.employmentType), salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      provenance: "internship-radar", allowInternational: input.allowInternational,
    };
    // Do not use the feed's claimed employment type to manufacture eligibility.
    if (assessPosting(posting, input.now).publish && description.length >= 80) return posting;
  }
  return null;
}
