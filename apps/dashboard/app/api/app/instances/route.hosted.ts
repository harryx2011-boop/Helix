import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { InstanceRow } from '@/lib/supabase/types';
import { encryptApiKey } from '@/lib/keys';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile();

  if (!supabaseConfigured()) {
    return NextResponse.json({ instances: [] });
  }

  const { data, error } = await supabaseAdmin()
    .from('instances')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const instances = ((data as InstanceRow[]) ?? []).map(({ key_ciphertext: _c, key_iv: _iv, ...rest }) => rest);
  return NextResponse.json({ instances });
}

interface CreateInstanceBody {
  name: string;
  base_url: string;
  key?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const profile = await requireProfile();
  const body = (await request.json()) as CreateInstanceBody;

  if (!body.name?.trim() || !body.base_url?.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'name and base_url are required' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'not_configured', message: 'Supabase is not configured in this environment.' }, { status: 503 });
  }

  let keyCiphertext: string | null = null;
  let keyIv: string | null = null;
  if (body.key?.trim()) {
    const { ciphertext, iv } = encryptApiKey(body.key.trim());
    keyCiphertext = `\\x${ciphertext.toString('hex')}`;
    keyIv = `\\x${iv.toString('hex')}`;
  }

  const { data, error } = await supabaseAdmin()
    .from('instances')
    .insert({
      profile_id: profile.id,
      name: body.name.trim(),
      base_url: body.base_url.trim().replace(/\/$/, ''),
      key_ciphertext: keyCiphertext,
      key_iv: keyIv,
    })
    .select('*')
    .single();
  if (error) throw error;

  const { key_ciphertext: _c, key_iv: _iv, ...rest } = data as InstanceRow;
  return NextResponse.json(rest, { status: 201 });
}
