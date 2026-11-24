import type { SupabaseClient } from "@supabase/supabase-js";
import { PIN_GLOBAL_LIMIT, PIN_IP_LIMIT, PIN_WINDOW_MS, isFourDigitPin, verifyPin } from "./security";

type PinResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 429 | 503; message: string };

const unavailable: PinResult = {
  ok: false,
  status: 503,
  message: "Could not check or record the PIN attempt. Try again later.",
};

export async function checkPinAttempt(
  db: SupabaseClient,
  input: { ipHash: string; pin: string; pinHash: string },
): Promise<PinResult> {
  try {
    // Commit a reservation BEFORE counting or checking the PIN. Concurrent requests
    // then count each other, including requests still verifying or already denied.
    // Never remove a reservation or exclude successful attempts from the limit.
    const { data: attempt, error: insertError } = await db
      .from("pin_attempts")
      .insert({ ip_hash: input.ipHash, success: false })
      .select("id, attempted_at")
      .single();
    if (insertError || !attempt?.id || typeof attempt.attempted_at !== "string") return unavailable;
    const attemptedAt = Date.parse(attempt.attempted_at);
    if (!Number.isFinite(attemptedAt)) return unavailable;

    // Use the database's clock, and a rolling cutoff for EVERY request rather
    // than a clock-aligned bucket. Counts use the primary after the insert commits.
    const since = new Date(attemptedAt - PIN_WINDOW_MS).toISOString();
    const [ip, global] = await Promise.all([
      db.from("pin_attempts").select("id", { count: "exact", head: true })
        .eq("ip_hash", input.ipHash).gte("attempted_at", since),
      db.from("pin_attempts").select("id", { count: "exact", head: true })
        .gte("attempted_at", since),
    ]);
    if (ip.error || global.error || ip.count == null || global.count == null ||
        !Number.isSafeInteger(ip.count) || !Number.isSafeInteger(global.count) ||
        ip.count < 1 || global.count < ip.count) return unavailable;

    // The current reservation is included: the fifth/twentieth attempt is
    // allowed, and the next one is rejected before password verification.
    if (ip.count > PIN_IP_LIMIT || global.count > PIN_GLOBAL_LIMIT) {
      return { ok: false, status: 429, message: "Too many attempts. Try again after 15 minutes without another attempt." };
    }
    if (!isFourDigitPin(input.pin)) {
      return { ok: false, status: 400, message: "Enter the 4-digit PIN." };
    }
    if (!verifyPin(input.pin, input.pinHash)) {
      return { ok: false, status: 401, message: "Incorrect PIN." };
    }

    const { data: recorded, error: updateError } = await db.from("pin_attempts")
      .update({ success: true }).eq("id", attempt.id).select("id").single();
    if (updateError || !recorded) return unavailable;
    return { ok: true };
  } catch {
    // Database/network failures must never turn off the limiter or grant access.
    return unavailable;
  }
}
