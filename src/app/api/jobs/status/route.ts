import { NextResponse } from "next/server";
import { failure, requireEditor } from "@/lib/jobs/guard";
import { writeJobStatus } from "@/lib/jobs/repository";
import type { ApplicationStage } from "@/lib/jobs/types";

const stages = new Set<ApplicationStage>([
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);

export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    jobId?: unknown;
    saved?: unknown;
    applied?: unknown;
    stage?: unknown;
    notes?: unknown;
  } | null;
  if (!body || typeof body.jobId !== "string") {
    return NextResponse.json({ ok: false, message: "Missing job." }, { status: 400 });
  }

  let stage: ApplicationStage | null | undefined;
  if (body.stage === null) stage = null;
  else if (typeof body.stage === "string" && stages.has(body.stage as ApplicationStage)) {
    stage = body.stage as ApplicationStage;
  } else if (body.stage !== undefined) {
    return NextResponse.json({ ok: false, message: "Unknown application stage." }, { status: 400 });
  }

  const notes =
    body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes).slice(0, 2000);

  const result = await writeJobStatus({
    jobId: body.jobId,
    saved: typeof body.saved === "boolean" ? body.saved : undefined,
    applied: typeof body.applied === "boolean" ? body.applied : undefined,
    stage,
    notes,
  });
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true });
}
