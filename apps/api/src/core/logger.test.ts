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

  it('scrubs a Hugging Face key', () => {
    expect(redactSecrets('hf_AbCdEfGhIjKlMnOpQrStUvWxYz1234 rejected')).toBe('[redacted] rejected');
  });

  it('scrubs a Groq key', () => {
    expect(redactSecrets('gsk_AbCdEfGhIjKlMnOpQrStUvWxYz1234 rejected')).toBe('[redacted] rejected');
  });

  it("scrubs this instance's own key format", () => {
    expect(redactSecrets('helix-a1b2c3d4e5f6g7h8 was revoked')).toBe('[redacted] was revoked');
  });

  it('leaves a hyphenated service name alone, which shares the helix- prefix', () => {
    expect(redactSecrets('helix-fetch returned 502')).toBe('helix-fetch returned 502');
    expect(redactSecrets('helix-extract-worker restarted')).toBe('helix-extract-worker restarted');
  });

  /**
   * A bare 32-hex string is as likely to be a request id as a key, and a bare
   * 64-hex string is almost always a sha256 of content. Masking either on shape
   * alone destroys the identifiers an operator traces a request by, so a long
   * hex run is masked only where the surrounding words claim it is a secret.
   */
  it('scrubs a hex token that names itself a secret', () => {
    expect(redactSecrets('secret=0123456789abcdef0123456789abcdef')).toBe('secret=[redacted]');
    expect(redactSecrets('authorization: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(
      'authorization: [redacted]',
    );
    expect(redactSecrets('token 0123456789abcdef0123456789abcdef')).toBe('token [redacted]');
  });

  it('leaves an unlabelled hex digest alone, because a sha256 in a log line is not a secret', () => {
    const digest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(redactSecrets(`content hash ${digest} unchanged`)).toBe(`content hash ${digest} unchanged`);
    expect(redactSecrets('job 0123456789abcdef0123456789abcdef finished')).toBe(
      'job 0123456789abcdef0123456789abcdef finished',
    );
  });
});
