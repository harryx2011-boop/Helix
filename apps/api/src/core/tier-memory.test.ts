import { describe, expect, it } from 'vitest';
import { TierMemory } from './tier-memory.js';

describe('TierMemory', () => {
  it('remembers the tier a host was served at after a block', () => {
    const memory = new TierMemory();
    memory.learn('https://www.npmjs.com/package/a', 'chromium');
    expect(memory.floor('https://www.npmjs.com/package/b')).toBe('chromium');
  });

  it('keys by host, not by page', () => {
    const memory = new TierMemory();
    memory.learn('https://medium.com/', 'chromium');
    expect(memory.floor('https://example.com/')).toBeUndefined();
  });

  it('forgets after the time to live', () => {
    let now = 0;
    const memory = new TierMemory({ ttlMs: 1_000, now: () => now });
    memory.learn('https://g2.com/', 'chromium');
    now = 1_001;
    expect(memory.floor('https://g2.com/')).toBeUndefined();
  });

  it('drops a host when told the floor stopped working', () => {
    const memory = new TierMemory();
    memory.learn('https://g2.com/', 'chromium');
    memory.forget('https://g2.com/x');
    expect(memory.floor('https://g2.com/')).toBeUndefined();
  });

  it('stays bounded', () => {
    const memory = new TierMemory({ maxHosts: 2 });
    memory.learn('https://a.com/', 'chromium');
    memory.learn('https://b.com/', 'chromium');
    memory.learn('https://c.com/', 'chromium');
    expect(memory.floor('https://a.com/')).toBeUndefined();
    expect(memory.floor('https://c.com/')).toBe('chromium');
  });
});
