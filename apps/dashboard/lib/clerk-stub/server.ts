/**
 * Self-host stub for @clerk/nextjs/server. See ./index.tsx — the static export
 * must not import Clerk at all.
 *
 * The middleware no-ops when not hosted and the session helpers are only
 * reached from hosted-only route handlers, so nothing here should ever run.
 */

const noAccounts = (): never => {
  throw new Error('Clerk is not available in the self-host build.');
};

export const clerkMiddleware = () => () => undefined;
export const createRouteMatcher = () => () => false;
export const auth = noAccounts;
export const currentUser = noAccounts;
