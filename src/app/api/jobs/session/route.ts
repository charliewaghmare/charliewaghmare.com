import { NextResponse } from "next/server";
import { JOBS_COOKIE, sessionSecret } from "@/lib/jobs/auth";
import { checkPinAttempt } from "@/lib/jobs/pin-attempts";
import { PIN_WINDOW_MS, hashIp, signSession } from "@/lib/jobs/security";
import { serviceClient } from "@/lib/jobs/supabase";

export async function POST(request: Request) {
  const secret = sessionSecret();
  const pinHash = process.env.JOBS_EDIT_PIN_HASH;
  if (!secret || !pinHash) {
    return NextResponse.json(
      { ok: false, message: "Edit mode is not configured yet." },
      { status: 503 },
    );
  }
  const db = serviceClient();
  if (!db) {
    return NextResponse.json(
      {
        ok: false,
        message: "PIN checks need the jobs database so lockouts survive a server restart.",
      },
      { status: 503 },
    );
  }

  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin.trim() : "";
  } catch {
    pin = "";
  }
  const result = await checkPinAttempt(db, { ipHash: hashIp(clientIp(request), secret), pin, pinHash });
  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.status,
      headers: result.status === 429 ? { "Retry-After": String(PIN_WINDOW_MS / 1000) } : undefined,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: JOBS_COOKIE,
    value: signSession(secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: JOBS_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
