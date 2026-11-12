import { NextResponse } from "next/server";
import { JOBS_COOKIE, sessionSecret } from "@/lib/jobs/auth";
import { countRecentPinFailures, recordPinAttempt } from "@/lib/jobs/repository";
import {
  PIN_WINDOW_MS,
  hashIp,
  isFourDigitPin,
  lockoutDecision,
  signSession,
  verifyPin,
} from "@/lib/jobs/security";
import { databaseConfigured } from "@/lib/jobs/supabase";

export async function POST(request: Request) {
  const secret = sessionSecret();
  const pinHash = process.env.JOBS_EDIT_PIN_HASH;
  if (!secret || !pinHash) {
    return NextResponse.json(
      { ok: false, message: "Edit mode is not configured yet." },
      { status: 503 },
    );
  }
  if (!databaseConfigured()) {
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
  if (!isFourDigitPin(pin)) {
    return NextResponse.json(
      { ok: false, message: "Enter the 4-digit PIN." },
      { status: 400 },
    );
  }

  const ipHash = hashIp(clientIp(request), secret);
  const since = new Date(Date.now() - PIN_WINDOW_MS).toISOString();
  const failures = await countRecentPinFailures(since, ipHash);
  if (!failures) {
    return NextResponse.json(
      { ok: false, message: "Could not check recent PIN attempts." },
      { status: 503 },
    );
  }
  const locked = lockoutDecision(failures);
  if (locked.locked) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const success = verifyPin(pin, pinHash);
  const recorded = await recordPinAttempt(success, ipHash);
  if (!recorded) {
    return NextResponse.json(
      { ok: false, message: "Could not record the PIN attempt." },
      { status: 503 },
    );
  }
  if (!success) {
    return NextResponse.json({ ok: false, message: "Incorrect PIN." }, { status: 401 });
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
