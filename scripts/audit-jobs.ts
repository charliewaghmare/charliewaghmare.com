import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { auditInventory, type InventoryItem } from "../src/lib/jobs/inventory";
import type { CollectedPosting } from "../src/lib/jobs/collect/rules";

const argument = (flag: string) => { const index = process.argv.indexOf(flag); return index < 0 ? null : process.argv[index + 1]; };

async function main() {
  const input = argument("--input");
  let records: Record<string, unknown>[];
  if (input) records = JSON.parse(await readFile(input, "utf8"));
  else {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or supply --input with an exported jobs array. This command only reads data.");
    const db = createClient(url, key, { auth: { persistSession: false } });
    records = [];
    for (let offset = 0;; offset += 200) {
      const { data, error } = await db.from("jobs").select("*, companies(name)").eq("active", true).eq("is_sample", false).order("id").range(offset, offset + 199);
      if (error) throw new Error(error.message);
      records.push(...data);
      if (data.length < 200) break;
    }
  }
  if (!Array.isArray(records)) throw new Error("Expected an array of jobs.");
  const items: InventoryItem[] = records.map((record) => {
    const value = (camel: string, snake: string) => record[camel] ?? record[snake] ?? null;
    const metadata = record.raw_metadata as Record<string, unknown> | undefined;
    const company = record.companies as { name?: string } | undefined;
    return { id: String(record.id), posting: {
      provider: String(record.source) as CollectedPosting["provider"], sourceId: String(value("sourceId", "source_id") ?? record.id),
      sourceUrl: value("sourceUrl", "source_url"), applicationUrl: value("applicationUrl", "application_url"),
      title: String(record.title), companyName: String(record.companyName ?? company?.name ?? "Unknown"),
      description: String(record.description ?? ""), location: record.location ?? null, country: record.country ?? null,
      departments: [], workArrangement: value("workArrangement", "work_arrangement"), employmentType: value("employmentType", "employment_type"),
      postedOn: value("postedOn", "posted_on"), salaryMin: record.salary_min ?? null, salaryMax: record.salary_max ?? null,
      salaryCurrency: record.salary_currency ?? null, salaryPeriod: record.salary_period ?? null,
      allowInternational: metadata?.allowInternational === true,
    } as CollectedPosting };
  });
  const results = await auditInventory(items, { verify: process.argv.includes("--verify") });
  const counts = Object.fromEntries(["verified_student", "ineligible", "not_on_complete_board", "unverified"].map((key) => [key, results.filter((item) => item.verdict === key).length]));
  const report = { auditedAt: new Date().toISOString(), readOnly: true, sourceVerified: process.argv.includes("--verify"), total: results.length, counts, results };
  const output = argument("--output");
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, results: output ? `Written to ${output}` : results }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; });
