import { describe, expect, it } from 'vitest';
import { redactUrlToken } from './logger.js';

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
