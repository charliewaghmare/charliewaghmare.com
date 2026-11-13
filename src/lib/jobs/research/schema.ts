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
        atsProvider: z.enum(["greenhouse", "lever", "ashby"]).nullable(),
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
  return researchFindingsSchema.parse(JSON.parse(text.slice(start, end + 1)));
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
