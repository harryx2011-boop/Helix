import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from './signature.js';

const SECRET = 'whsec_test';
const BODY = '{"event":"page","data":{"url":"https://example.com"}}';

describe('webhook signatures', () => {
  it('produces a header the verifier accepts', () => {
    const header = signPayload(SECRET, 1_700_000_000, BODY);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(SECRET, header, BODY, { now: 1_700_000_010 })).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    const header = signPayload(SECRET, 1_700_000_000, BODY);
    expect(verifySignature(SECRET, header, BODY + ' ', { now: 1_700_000_010 })).toBe(false);
  });

  it('rejects a timestamp outside the tolerance window', () => {
    // A captured delivery replayed an hour later must fail even with a valid MAC.
    const header = signPayload(SECRET, 1_700_000_000, BODY);
    expect(verifySignature(SECRET, header, BODY, { now: 1_700_003_601 })).toBe(false);
  });

  it('rejects a malformed header without throwing', () => {
    expect(verifySignature(SECRET, 'nonsense', BODY)).toBe(false);
    expect(verifySignature(SECRET, 't=abc,v1=', BODY)).toBe(false);
  });
});
