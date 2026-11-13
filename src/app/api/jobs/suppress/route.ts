import { NextResponse } from "next/server";
import { failure, requireEditor } from "@/lib/jobs/guard";
import { ignoreJob, undoIgnore } from "@/lib/jobs/repository";

export async function POST(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { jobId?: unknown } | null;
  if (!body || typeof body.jobId !== "string") {
    return NextResponse.json({ ok: false, message: "Missing job." }, { status: 400 });
  }
  const result = await ignoreJob(body.jobId);
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true, suppressionId: result.suppressionId });
}

export async function DELETE(request: Request) {
  const denied = await requireEditor();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { suppressionId?: unknown } | null;
  if (!body || typeof body.suppressionId !== "string") {
    return NextResponse.json({ ok: false, message: "Missing ignored listing." }, { status: 400 });
  }
  const result = await undoIgnore(body.suppressionId);
  if (!result.ok) return failure(result);
  return NextResponse.json({ ok: true });
}
