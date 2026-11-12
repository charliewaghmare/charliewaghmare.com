import { cookies } from "next/headers";
import { readSessionExpiry } from "@/lib/jobs/security";

export const JOBS_COOKIE = "jobs_edit";

export function sessionSecret(): string | null {
  const secret = process.env.JOBS_SESSION_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

export async function currentEditExpiry(): Promise<number | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const jar = await cookies();
  const token = jar.get(JOBS_COOKIE)?.value;
  if (!token) return null;
  return readSessionExpiry(token, secret);
}

export async function editUnlocked(): Promise<boolean> {
  return (await currentEditExpiry()) !== null;
}
