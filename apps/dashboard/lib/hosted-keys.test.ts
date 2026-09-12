import { describe, expect, it } from 'vitest';
import { hostedKeyBody } from './hosted-keys';

describe('hostedKeyBody', () => {
  it('keeps a rate limit of 0', () => {
    expect(hostedKeyBody('agent', 0)).toEqual({ name: 'agent', rateLimit: 0 });
  });

  it('omits rateLimit when undefined', () => {
    expect(hostedKeyBody('agent', undefined)).toEqual({ name: 'agent' });
  });

  it('keeps a rate limit of 500', () => {
    expect(hostedKeyBody('agent', 500)).toEqual({ name: 'agent', rateLimit: 500 });
  });
});
