import { Webhook } from 'svix';
import { NextResponse } from 'next/server';
import { ensureProfile } from '@/lib/profiles';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';

interface ClerkEmail { id: string; email_address: string }
interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: ClerkEmail[];
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
}

/** Clerk → Supabase sync (WEBSITE.md §6.1). `user.created` mints the default key via ensureProfile. */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });

  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  if (!supabaseConfigured()) return NextResponse.json({ ok: true, skipped: 'supabase not configured' });

  const { data } = event;
  const email = data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ?? data.email_addresses?.[0]?.email_address ?? '';
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

  if (event.type === 'user.created') {
    await ensureProfile({ clerkUserId: data.id, email, name, avatarUrl: data.image_url ?? null });
  } else if (event.type === 'user.updated') {
    await supabaseAdmin().from('profiles').update({ email, name, avatar_url: data.image_url ?? null }).eq('clerk_user_id', data.id);
  } else if (event.type === 'user.deleted') {
    await supabaseAdmin().from('profiles').delete().eq('clerk_user_id', data.id);
  }

  return NextResponse.json({ ok: true });
}
