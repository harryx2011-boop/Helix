import { Webhook } from 'svix';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserPayload {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

function primaryEmail(user: ClerkUserPayload): string | undefined {
  return (
    user.email_addresses.find((e) => e.id === user.primary_email_address_id)?.email_address ??
    user.email_addresses[0]?.email_address
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });

  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: ClerkWebhookEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'supabase not configured' });
  }

  const user = event.data;

  switch (event.type) {
    case 'user.created': {
      const email = primaryEmail(user);
      if (email) {
        await ensureProfile({
          clerkUserId: user.id,
          email,
          name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
          avatarUrl: user.image_url,
        });
      }
      break;
    }
    case 'user.updated': {
      const email = primaryEmail(user);
      await supabaseAdmin()
        .from('profiles')
        .update({
          ...(email ? { email } : {}),
          name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
          avatar_url: user.image_url,
          updated_at: new Date().toISOString(),
        })
        .eq('clerk_user_id', user.id);
      break;
    }
    case 'user.deleted': {
      const admin = supabaseAdmin();
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('clerk_user_id', user.id)
        .maybeSingle<{ id: string }>();

      if (profile) {
        await admin
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('profile_id', profile.id)
          .is('revoked_at', null);
        await admin.from('profiles').delete().eq('id', profile.id);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
