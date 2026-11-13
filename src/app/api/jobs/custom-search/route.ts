import { NextResponse } from "next/server";
import { failure, requireEditor } from "@/lib/jobs/guard";
import { readResearchRun, requestCustomResearch } from "@/lib/jobs/repository";
import { parseDepth } from "@/lib/jobs/research/depth";

export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { prompt?: unknown; depth?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 8 || prompt.length > 500) {
    return NextResponse.json(
      { ok: false, message: "Write a search between 8 and 500 characters." },
      { status: 400 },
    );
  }
  const depth = parseDepth(typeof body?.depth === "string" ? body.depth : "standard") ?? "standard";
  const result = await requestCustomResearch({ prompt, depth });
  if (!result.ok) return failure(result);
  return NextResponse.json({
    ok: true,
    runId: result.runId,
    message: "Research requested. This page will update when the run finishes.",
  });
}

export async function GET(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, message: "Missing research run." }, { status: 400 });
  }
  const result = await readResearchRun(id);
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true, run: result.run });
}
