import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for route handlers and server components. Persona has
 * no signed-in browser path (PERSONA-REVAMP.md: no accounts), so every
 * database access goes through here and the key never leaves the server.
 */

let client: SupabaseClient | undefined;

function secretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(secretKey());
}

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = secretKey();
  if (!url || !key) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
