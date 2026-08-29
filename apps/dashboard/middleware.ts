import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const isProtected = createRouteMatcher(['/app(.*)']);

const hosted = process.env.HELIX_HOSTED === '1';

// The sign-in paths are passed here, not only to ClerkProvider: protect() runs
// in middleware and reads these (or NEXT_PUBLIC_CLERK_SIGN_IN_URL), and with
// neither set it sent a signed-out visitor to Clerk's hosted accounts.dev
// portal instead of this site's own /sign-in. Env stays supported; it is no
// longer load-bearing.
const clerk = clerkMiddleware(
  async (auth, req) => {
    if (isProtected(req)) await auth.protect();
  },
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!hosted) return NextResponse.next();
  return clerk(req, event);
}

export const config = {
  matcher: ['/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|md|txt)).*)'],
};
