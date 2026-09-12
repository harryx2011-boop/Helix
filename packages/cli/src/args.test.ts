import { describe, expect, it } from 'vitest';
import { flagSet, flagValue, flagValues, parseArgs } from './args.js';

const VALUED = new Set(['key', 'client', 'mcp-url', 'site-url']);

describe('parseArgs', () => {
  it('parses --flag, --flag value, --flag=value and -k value', () => {
    const parsed = parseArgs(['--key=abc', '-k', 'def', '--all', 'positional'], VALUED);
    expect(flagValues(parsed, 'key')).toEqual(['abc', 'def']);
    expect(flagSet(parsed, 'all')).toBe(true);
    expect(parsed.positional).toEqual(['positional']);
  });

  it('collects repeated flags into an array', () => {
    const parsed = parseArgs(['--client', 'cursor', '--client', 'codex'], VALUED);
    expect(flagValues(parsed, 'client')).toEqual(['cursor', 'codex']);
    expect(flagValue(parsed, 'client')).toBe('codex');
  });

  /* A boolean flag given an inline value must accept only true/false and
     reject anything else, rather than silently discarding the value and
     treating the flag as set regardless of what was written. */
  it('accepts --flag=true and --flag=false for a boolean flag', () => {
    const asTrue = parseArgs(['--dry-run=true'], VALUED);
    expect(flagSet(asTrue, 'dry-run')).toBe(true);

    const asFalse = parseArgs(['--dry-run=false'], VALUED);
    expect(flagSet(asFalse, 'dry-run')).toBe(false);
  });

  it('rejects a non-boolean inline value on a boolean flag', () => {
    expect(() => parseArgs(['--dry-run=maybe'], VALUED)).toThrow('--dry-run takes no value');
  });

  /* A valued flag whose next token looks like another flag must not silently
     swallow it as the value -- `--key --all` should fail loudly rather than
     treat "--all" as the key. */
  it('throws when a valued flag is immediately followed by another flag', () => {
    expect(() => parseArgs(['--key', '--all'], VALUED)).toThrow('--key requires a value');
  });

  it('still allows a valued flag at the very end to fail with the existing message', () => {
    expect(() => parseArgs(['--key'], VALUED)).toThrow('--key needs a value');
  });

  it('allows a valued flag whose value happens to start with a single dash, e.g. a negative-looking token', () => {
    // Only a token starting with -- is treated as another flag.
    const parsed = parseArgs(['--key', '-not-a-flag-name'], VALUED);
    expect(flagValue(parsed, 'key')).toBe('-not-a-flag-name');
  });

  it('parses ordinary boolean flags with no inline value as before', () => {
    const parsed = parseArgs(['--all', '--browser'], VALUED);
    expect(flagSet(parsed, 'all')).toBe(true);
    expect(flagSet(parsed, 'browser')).toBe(true);
  });
});
