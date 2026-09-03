import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

// End-to-end proof of the one-database model: sign in through Clerk, create a
// key on /app/keys, then read the same row back through Supabase's Data API.
// Run from research/firecrawl-capture with MSYS_NO_PATHCONV=1 and the dashboard
// dev server on 3400 in hosted mode.

const envText = fs.readFileSync(path.resolve('../../apps/dashboard/.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;

const BASE = process.env.BASE ?? 'http://localhost:3400';
const IDENTIFIER = process.env.E2E_EMAIL ?? 'e2e+clerk_test@helix.dev';
const OUT = process.env.OUT ?? '.';

await clerkSetup();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + '/sign-in', { waitUntil: 'load' });
await clerk.loaded({ page });
await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: IDENTIFIER } });

await page.goto(BASE + '/app/keys', { waitUntil: 'networkidle', timeout: 90000 });
const listBefore = await page.request.get(BASE + '/api/app/keys');
console.log('GET /api/app/keys ->', listBefore.status(), (await listBefore.text()).slice(0, 160));

const name = `probe ${new Date().toISOString().slice(0, 16)}`;
const created = await page.request.post(BASE + '/api/app/keys', { data: { name } });
const body = await created.json();
console.log('POST /api/app/keys ->', created.status(), JSON.stringify({ ...body, key: body.key ? body.key.slice(0, 10) + '…' : undefined }));

await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'hosted-keys.png'), fullPage: false });

const rest = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/api_keys?select=id,name,key_prefix,profile_id,created_at&order=created_at.desc&limit=3`, {
  headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
});
const rows = await rest.json();
console.log('Supabase api_keys (newest 3):', JSON.stringify(rows));
const match = Array.isArray(rows) && rows.find((r) => r.id === body.id);
console.log(match ? `MATCH: dashboard key ${body.id} is row ${match.id} with profile ${match.profile_id}` : 'NO MATCH');

const profiles = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id,clerk_user_id,email`, {
  headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
});
console.log('profiles:', await profiles.text());
await browser.close();
