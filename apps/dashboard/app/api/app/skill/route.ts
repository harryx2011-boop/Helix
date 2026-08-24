import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { byteaToBuffer } from '@/lib/profiles';
import { decryptApiKey, maskApiKey } from '@/lib/keys';
import type { ApiKeyRow } from '@/lib/supabase/types';
import { orderBySelection } from '@/lib/catalog';
import { generateSkillMarkdown } from '@/lib/skill';
import { KEY_PLACEHOLDER } from '@/lib/codegen';
import { PUBLIC_API_URL, MCP_URL } from '@/lib/mode';

export const dynamic = 'force-dynamic';

/** Serves the current profile's SKILL.md for their selected endpoints (WEBSITE.md §9.3). */
export async function GET() {
  const profile = await requireProfile();
  const endpoints = orderBySelection(profile.selected_endpoints).filter((e) => profile.selected_endpoints.includes(e.id));

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

  const markdown = generateSkillMarkdown({
    endpoints,
    apiKey: apiKey ?? KEY_PLACEHOLDER,
    baseUrl: PUBLIC_API_URL,
    mcpUrl: MCP_URL,
  });

  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="SKILL.md"',
    },
  });
}
