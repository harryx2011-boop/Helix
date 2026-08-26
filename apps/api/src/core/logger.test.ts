import { describe, expect, it } from 'vitest';
import { redactSecrets, redactUrlToken } from './logger.js';

describe('redactUrlToken', () => {
  it('scrubs the live-view token wherever it sits in the query', () => {
    expect(redactUrlToken('/v1/interact/live/sess_1?token=abc123')).toBe('/v1/interact/live/sess_1?token=[redacted]');
    expect(redactUrlToken('/v1/interact/live/sess_1/stream?token=abc&x=1')).toBe(
      '/v1/interact/live/sess_1/stream?token=[redacted]&x=1',
    );
    expect(redactUrlToken('/v1/interact/live/sess_1/stream?x=1&TOKEN=abc')).toBe(
      '/v1/interact/live/sess_1/stream?x=1&TOKEN=[redacted]',
    );
  });

  it('leaves every other URL alone', () => {
    expect(redactUrlToken('/v1/scrape')).toBe('/v1/scrape');
    expect(redactUrlToken('/v1/jobs?tokens=5')).toBe('/v1/jobs?tokens=5');
  });
});

describe('redactSecrets', () => {
  it('scrubs the masked key OpenAI echoes back on a 401', () => {
    // The real string a live probe produced against OpenAI.
    const upstream =
      "openai (gpt-4o-mini) returned HTTP 401: Error code: 401 - {'error': {'message': 'Incorrect API key provided: sk-inval************-000. You can find your API key at https://platform.openai.com/account/api-keys.'}}";
    const safe = redactSecrets(upstream);

    expect(safe).not.toContain('sk-inval');
    expect(safe).toContain('[redacted]');
    // The part the caller can act on survives.
    expect(safe).toContain('401');
    expect(safe).toContain('openai (gpt-4o-mini)');
  });

  it('scrubs whole keys by provider prefix', () => {
    expect(redactSecrets('key sk-abcdefghijklmnop failed')).toBe('key [redacted] failed');
    expect(redactSecrets('AIzaSyA1B2C3D4E5F6G7H8 rejected')).toBe('[redacted] rejected');
  });

  it('scrubs a value that names itself a key or token', () => {
    expect(redactSecrets('api_key=9f8e7d6c5b4a3210')).toBe('api_key=[redacted]');
    expect(redactSecrets('Bearer eyJhbGciOiJIUzI1NiJ9')).toBe('Bearer [redacted]');
  });

  it('leaves an ordinary message alone', () => {
    expect(redactSecrets('helix-extract is unreachable')).toBe('helix-extract is unreachable');
    expect(redactSecrets('schema.properties.title: expected string')).toBe('schema.properties.title: expected string');
  });
});
