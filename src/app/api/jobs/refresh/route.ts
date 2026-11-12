import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/jobs/guard";

export async function POST() {
  const denied = await requireEditor();
  if (denied) return denied;
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      message: "Job collection is not configured yet. No refresh was run.",
    },
    { status: 501 },
  );
}
