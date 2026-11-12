import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function databaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function pinConfigured(): boolean {
  return Boolean(process.env.JOBS_EDIT_PIN_HASH && process.env.JOBS_SESSION_SECRET);
}

function client(key: string | undefined): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Server-only client. Bypasses RLS, so routes must check the edit session first. */
export function serviceClient(): SupabaseClient | null {
  return client(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Read-only client constrained by RLS. */
export function anonClient(): SupabaseClient | null {
  return client(process.env.SUPABASE_ANON_KEY);
}
