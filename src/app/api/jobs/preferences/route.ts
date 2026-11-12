import { NextResponse } from "next/server";
import { failure, requireEditor } from "@/lib/jobs/guard";
import { defaultSearchPreferences, isSearchPreferences } from "@/lib/jobs/profile";
import { savePreferences } from "@/lib/jobs/repository";
import type { SearchPreferences } from "@/lib/jobs/types";

export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Partial<SearchPreferences> | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Missing preferences." }, { status: 400 });
  }
  const candidate: SearchPreferences = {
    ...defaultSearchPreferences,
    ...body,
    weights: { ...defaultSearchPreferences.weights, ...body.weights },
    locations: { ...defaultSearchPreferences.locations, ...body.locations },
  };
  if (!isSearchPreferences(candidate)) {
    return NextResponse.json(
      { ok: false, message: "Weights must add up to 100, and the minimum score must be 0–100." },
      { status: 400 },
    );
  }
  const result = await savePreferences(candidate);
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true });
}
