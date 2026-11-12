import { NextResponse } from "next/server";
import { editUnlocked } from "@/lib/jobs/auth";

export async function requireEditor(): Promise<NextResponse | null> {
  if (await editUnlocked()) return null;
  return NextResponse.json({ ok: false, message: "Edit mode is locked." }, { status: 401 });
}

export function failure(
  result: { ok: false; status: number; message: string },
): NextResponse {
  return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
}
