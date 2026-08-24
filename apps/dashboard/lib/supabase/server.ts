import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/**
 * Service-role client for server routes only (WEBSITE.md §10). Never import
 * from a client component; `server-only` enforces that at build time.
 *
 * Untyped on purpose until `supabase gen types` runs against the real project;
 * callers cast rows to the shapes in ./types.
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)');
  client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));
}
