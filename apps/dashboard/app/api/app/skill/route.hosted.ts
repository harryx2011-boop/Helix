import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { byteaToBuffer } from '@/lib/profiles';
import { decryptApiKey, hashApiKey, isApiKeyShape, maskApiKey } from '@/lib/keys';
import type { ApiKeyRow, ProfileRow } from '@/lib/supabase/types';
import { ENDPOINTS, orderBySelection } from '@/lib/catalog';
import { generateSkillMarkdown } from '@/lib/skill';
import { KEY_PLACEHOLDER } from '@/lib/codegen';
import { PUBLIC_API_URL, MCP_URL } from '@/lib/mode';

export const dynamic = 'force-dynamic';

function markdownResponse(markdown: string): Response {
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="SKILL.md"',
    },
  });
}

function selectedEndpoints(profile: ProfileRow | null) {
  if (!profile || profile.selected_endpoints.length === 0) return ENDPOINTS.filter((e) => e.product);
  return orderBySelection(profile.selected_endpoints).filter((e) => profile.selected_endpoints.includes(e.id));
}

/**
 * The CLI path: `Authorization: Bearer helix-…` identifies the account by key
 * hash, no browser session involved. Without Supabase (self-host) there is no
 * account to look up, so the key is taken at face value and every endpoint is
 * included; the document only ever contains the caller's own key.
 */
async function skillForBearer(key: string): Promise<Response> {
  if (!isApiKeyShape(key)) {
    return Response.json({ error: 'unauthorized', message: 'Invalid API key.' }, { status: 401 });
  }

  let profile: ProfileRow | null = null;
  if (supabaseConfigured()) {
    const { data: keyRow } = await supabaseAdmin()
      .from('api_keys')
      .select('profile_id')
      .eq('key_hash', hashApiKey(key))
      .is('revoked_at', null)
      .maybeSingle();
    const profileId = (keyRow as Pick<ApiKeyRow, 'profile_id'> | null)?.profile_id;
    if (!profileId) {
      return Response.json({ error: 'unauthorized', message: 'Invalid API key.' }, { status: 401 });
    }
    const { data } = await supabaseAdmin().from('profiles').select('*').eq('id', profileId).maybeSingle();
    profile = (data as ProfileRow | null) ?? null;
  }

  return markdownResponse(
    generateSkillMarkdown({ endpoints: selectedEndpoints(profile), apiKey: key, baseUrl: PUBLIC_API_URL, mcpUrl: MCP_URL }),
  );
}

/** Serves the current profile's SKILL.md for their selected endpoints (WEBSITE.md §9.3). */
export async function GET(request: Request) {
  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (bearer) return skillForBearer(bearer);

  const profile = await requireProfile();
  const endpoints = selectedEndpoints(profile);

  let apiKey: string | undefined;
  if (supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from('api_keys')
      .select('*')
      .eq('profile_id', profile.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const keyRow = data as ApiKeyRow | null;
    if (keyRow) {
      try {
        apiKey = decryptApiKey(byteaToBuffer(keyRow.key_ciphertext), byteaToBuffer(keyRow.key_iv));
      } catch {
        apiKey = maskApiKey(keyRow.prefix, keyRow.last3);
      }
    }
  }

  return markdownResponse(
    generateSkillMarkdown({
      endpoints,
      apiKey: apiKey ?? KEY_PLACEHOLDER,
      baseUrl: PUBLIC_API_URL,
      mcpUrl: MCP_URL,
    }),
  );
}
