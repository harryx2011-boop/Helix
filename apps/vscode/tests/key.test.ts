import { describe, expect, it } from 'vitest';
import { keyProblem } from '../src/key';

describe('keyProblem', () => {
  it('accepts a Helix key', () => {
    expect(keyProblem('helix-0123456789abcdef0123456789abcdef')).toBeUndefined();
    expect(keyProblem('  helix-0123456789abcdef  ')).toBeUndefined();
  });

  it('explains what is wrong with anything else', () => {
    expect(keyProblem('')).toBe('Paste an API key that starts with helix-.');
    expect(keyProblem('sk-ant-0123456789')).toBe('Paste an API key that starts with helix-.');
    expect(keyProblem('helix-short')).toBe('That key is too short to be a Helix key.');
  });
});
