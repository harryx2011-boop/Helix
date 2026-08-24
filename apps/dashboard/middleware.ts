import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtected = createRouteMatcher(['/app(.*)', '/onboarding(.*)', '/api/app/(.*)']);

const hosted = process.env.HELIX_HOSTED === '1';

export default hosted
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|md|txt)).*)', '/(api|trpc)(.*)'],
};
