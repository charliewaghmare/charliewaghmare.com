import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SESSION_VERSION = 1;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export const PIN_WINDOW_MS = 15 * 60 * 1000;
export const PIN_IP_LIMIT = 5;
export const PIN_GLOBAL_LIMIT = 20;

export function hashPin(pin: string, salt = randomBytes(16).toString("base64url")): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const key = scryptSync(pin, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt}$${key.toString("base64url")}`;
}

export function verifyPin(pin: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 16384 || r < 8 || p < 1) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (expected.length < 32) return false;
  const derived = scryptSync(pin.normalize("NFKC"), parts[4], expected.length, { N, r, p });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function signSession(secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ v: SESSION_VERSION, exp: now + SESSION_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSessionExpiry(token: string, secret: string, now = Date.now()): number | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      v?: number;
      exp?: number;
    };
    if (data.v !== SESSION_VERSION || typeof data.exp !== "number" || data.exp <= now) {
      return null;
    }
    return data.exp;
  } catch {
    return null;
  }
}

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("base64url");
}

export function lockoutDecision(input: {
  ipFailures: number;
  globalFailures: number;
}): { locked: boolean; scope: "ip" | "global" | null } {
  if (input.ipFailures >= PIN_IP_LIMIT) return { locked: true, scope: "ip" };
  if (input.globalFailures >= PIN_GLOBAL_LIMIT) return { locked: true, scope: "global" };
  return { locked: false, scope: null };
}

export function isFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
