import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "HTTPS required");

export const researchFindingsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        employer: z.string().min(2).max(160),
        location: z.string().max(200).nullable(),
        country: z.string().max(80).nullable(),
        applicationUrl: httpsUrl,
        sourceUrl: httpsUrl,
        evidenceQuote: z.string().min(24).max(500),
        employmentType: z.string().max(80).nullable(),
      }),
    )
    .max(8),
  companies: z
    .array(
      z.object({
        name: z.string().min(2).max(160),
        website: httpsUrl,
        careersUrl: httpsUrl.nullable(),
        industry: z.string().max(80),
        location: z.string().max(120).nullable(),
        why: z.string().max(400),
        atsProvider: z.enum(["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "workday"]).nullable(),
        atsBoardId: z.string().max(80).nullable(),
      }),
    )
    .max(6),
});

export type ResearchFindings = z.infer<typeof researchFindingsSchema>;

export function parseFindings(text: string): ResearchFindings {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Research response did not contain JSON.");
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as { jobs?: unknown; companies?: unknown };
  return researchFindingsSchema.parse({
    jobs: sanitizeJobs(parsed.jobs),
    companies: sanitizeCompanies(parsed.companies),
  });
}

function sanitizeJobs(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    for (const key of ["applicationUrl", "sourceUrl"]) {
      if (typeof row[key] === "string" && row[key] && !String(row[key]).startsWith("https://")) {
        throw new Error("HTTPS required");
      }
    }
    const quote = clip(row.evidenceQuote, 500);
    if (quote.length < 24) return [];
    return [
      {
        ...row,
        title: clip(row.title, 200),
        employer: clip(row.employer, 160),
        location: clipOrNull(row.location, 200),
        country: clipOrNull(row.country, 80),
        evidenceQuote: quote,
        employmentType: clipOrNull(row.employmentType, 80),
      },
    ];
  });
}

function sanitizeCompanies(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const providers = new Set(["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "workday"]);
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const provider = typeof row.atsProvider === "string" && providers.has(row.atsProvider) ? row.atsProvider : null;
    return [
      {
        ...row,
        name: clip(row.name, 160),
        industry: clip(row.industry, 80),
        location: clipOrNull(row.location, 120),
        why: clip(row.why, 400),
        atsProvider: provider,
        atsBoardId: clipOrNull(row.atsBoardId, 120),
      },
    ];
  });
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clipOrNull(value: unknown, max: number): string | null {
  if (value == null) return null;
  const clipped = clip(value, max);
  return clipped || null;
}

export function outputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return "";
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
        parts.push((block as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
}

export function usageFromPayload(payload: unknown): { inputTokens: number; outputTokens: number; searchCalls: number } {
  const record = payload && typeof payload === "object" ? (payload as { usage?: { input_tokens?: number; output_tokens?: number }; output?: unknown }) : {};
  const output = Array.isArray(record.output) ? record.output : [];
  const searchCalls = output.filter((item) => item && typeof item === "object" && (item as { type?: string }).type === "web_search_call").length;
  return {
    inputTokens: record.usage?.input_tokens ?? 0,
    outputTokens: record.usage?.output_tokens ?? 0,
    searchCalls,
  };
}
