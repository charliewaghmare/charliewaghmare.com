import type { CollectedPosting } from "@/lib/jobs/collect/rules";
import { canonicalUrl, inferArrangement, inferCountry, stripHtml } from "@/lib/jobs/collect/text";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordValue;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function salaryFrom(value: unknown): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
} {
  const row = record(value);
  const min = numberOrNull(row?.min ?? row?.minValue ?? row?.minimum);
  const max = numberOrNull(row?.max ?? row?.maxValue ?? row?.maximum);
  return {
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: text(row?.currency),
    salaryPeriod: text(row?.interval ?? row?.period),
  };
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
}

export function mapGreenhouseJob(value: unknown, companyName: string): CollectedPosting | null {
  const row = record(value);
  if (!row || (typeof row.id !== "number" && typeof row.id !== "string")) return null;
  const title = text(row.title);
  if (!title) return null;
  const location = text(record(row.location)?.name);
  const content = stripHtml(text(row.content) ?? "");
  const departments = Array.isArray(row.departments)
    ? row.departments.flatMap((item) => {
        const name = text(record(item)?.name);
        return name ? [name] : [];
      })
    : [];
  const metadata = Array.isArray(row.metadata) ? row.metadata : [];
  const salaryMeta = metadata.find((item) => /salary|compensation/i.test(text(record(item)?.name) ?? ""));
  const salary = salaryFrom(record(salaryMeta)?.value);
  const sourceUrl = canonicalUrl(text(row.absolute_url));
  return {
    provider: "greenhouse",
    sourceId: String(row.id),
    title,
    companyName: text(row.company_name) ?? companyName,
    location,
    country: inferCountry(location),
    workArrangement: inferArrangement(location, null),
    description: content,
    departments,
    sourceUrl,
    applicationUrl: sourceUrl,
    postedOn: dateOnly(row.first_published),
    employmentType: null,
    ...salary,
  };
}

export function mapLeverJob(value: unknown, companyName: string): CollectedPosting | null {
  const row = record(value);
  const title = text(row?.text);
  const id = text(row?.id);
  if (!row || !title || !id) return null;
  const categories = record(row.categories);
  const location = text(categories?.location) ?? text(row.country);
  const description = stripHtml(
    [text(row.descriptionPlain), text(row.descriptionBodyPlain), text(row.openingPlain)]
      .filter(Boolean)
      .join(" "),
  );
  const hosted = canonicalUrl(text(row.hostedUrl));
  const apply = canonicalUrl(text(row.applyUrl));
  const salary = salaryFrom(row.salaryRange ?? row.salary);
  return {
    provider: "lever",
    sourceId: id,
    title,
    companyName,
    location,
    country: text(row.country) ?? inferCountry(location),
    workArrangement: inferArrangement(location, text(row.workplaceType)),
    description,
    departments: [text(categories?.department), text(categories?.team)].filter(
      (item): item is string => Boolean(item),
    ),
    sourceUrl: hosted,
    applicationUrl: apply ?? hosted,
    postedOn: dateOnly(row.createdAt),
    employmentType: text(categories?.commitment),
    ...salary,
  };
}

export function mapAshbyJob(value: unknown, companyName: string): CollectedPosting | null {
  const row = record(value);
  const title = text(row?.title);
  const id = text(row?.id);
  if (!row || !title || !id || row.isListed === false) return null;
  const location = text(row.location) ?? text(record(row.address)?.postalAddress);
  const description = stripHtml(text(row.descriptionPlain) ?? text(row.descriptionHtml) ?? "");
  const sourceUrl = canonicalUrl(text(row.jobUrl));
  const apply = canonicalUrl(text(row.applyUrl));
  const salary = salaryFrom(row.compensation ?? row.compensationTierSummary);
  const workplace = text(row.workplaceType);
  return {
    provider: "ashby",
    sourceId: id,
    title,
    companyName,
    location,
    country: inferCountry(location),
    workArrangement:
      row.isRemote === true ? "remote" : inferArrangement(location, workplace),
    description,
    departments: [text(row.department), text(row.team)].filter((item): item is string => Boolean(item)),
    sourceUrl,
    applicationUrl: apply ?? sourceUrl,
    postedOn: dateOnly(row.publishedAt),
    employmentType: text(row.employmentType),
    ...salary,
  };
}
