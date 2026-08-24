import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe-shaped signing: HMAC-SHA256 over `{timestamp}.{body}`, sent as
 * `Helix-Signature: t=<unix>,v1=<hex>`. The timestamp inside the signed string
 * is what stops a captured delivery from being replayed later.
 */

export const SIGNATURE_HEADER = 'helix-signature';
const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, body: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export interface VerifyOptions {
  toleranceSeconds?: number;
  now?: number;
}

/** Constant-time check of a `Helix-Signature` header against the raw body. */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  options: VerifyOptions = {},
): boolean {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, value] = part.trim().split('=', 2);
      return [key ?? '', value ?? ''] as const;
    }),
  );

  const timestamp = Number.parseInt(parts.get('t') ?? '', 10);
  const provided = parts.get('v1');
  if (!Number.isFinite(timestamp) || !provided) return false;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
