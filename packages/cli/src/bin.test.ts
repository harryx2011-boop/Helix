import { describe, expect, it, vi } from 'vitest';
import { main } from './bin.js';

/* console.log/error calls in main() are noisy in test output; silence them
   without hiding real assertion failures. */
function quiet() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    log.mockRestore();
    error.mockRestore();
  };
}

describe('main exit codes', () => {
  it('exits 0 when --help is passed with no command', async () => {
    const restore = quiet();
    try {
      expect(await main(['--help'])).toBe(0);
      expect(await main(['-h'])).toBe(0);
    } finally {
      restore();
    }
  });

  it('exits 1 when no command and no help flag are given', async () => {
    const restore = quiet();
    try {
      expect(await main([])).toBe(1);
    } finally {
      restore();
    }
  });

  it('still exits 0 when --help is passed alongside a command', async () => {
    const restore = quiet();
    try {
      expect(await main(['init', '--help'])).toBe(0);
    } finally {
      restore();
    }
  });
});
