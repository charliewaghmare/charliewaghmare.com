import { NextResponse } from "next/server";
import { failure, requireEditor } from "@/lib/jobs/guard";
import { storeCustomSearch } from "@/lib/jobs/repository";

export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 8 || prompt.length > 500) {
    return NextResponse.json(
      { ok: false, message: "Write a search note between 8 and 500 characters." },
      { status: 400 },
    );
  }
  const result = await storeCustomSearch(prompt);
  if (!result.ok) return failure(result);
  return NextResponse.json({
    ok: true,
    configured: false,
    message: "Saved for a later phase. No live research was run.",
  });
}
