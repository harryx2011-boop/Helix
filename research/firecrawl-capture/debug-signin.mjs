import { chromium } from 'playwright';
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import fs from 'fs';
const envText = fs.readFileSync('../../apps/dashboard/.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
await clerkSetup();
const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage();
await setupClerkTestingToken({ page });
await page.goto('http://localhost:3400/sign-in', { waitUntil: 'load' });
await clerk.loaded({ page });
try {
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: 'e2e+clerk_test@helix.dev' } });
  console.log('signIn resolved');
} catch (e) { console.log('signIn THREW:', e.message.slice(0, 300)); }
await page.waitForTimeout(1500);
console.log('clerk user:', await page.evaluate(() => ({ user: window.Clerk?.user?.id, session: window.Clerk?.session?.status, email: window.Clerk?.user?.primaryEmailAddress?.emailAddress })));
console.log('cookies:', (await ctx.cookies()).map((c) => c.name + '@' + c.domain).join(', '));
const r = await page.goto('http://localhost:3400/app', { waitUntil: 'load' });
console.log('goto /app ->', r.status(), page.url());
await b.close();
