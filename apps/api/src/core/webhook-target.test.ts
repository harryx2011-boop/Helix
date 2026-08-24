import { describe, expect, it } from 'vitest';
import { assertPublicTarget, BlockedTargetError, isPublicAddress, webhookTargetProblem } from './webhook-target.js';

describe('isPublicAddress', () => {
  it('refuses loopback, private, link-local, CGNAT, multicast and metadata addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '127.8.8.8',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      'ff02::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a00:1',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('accepts public addresses and nothing that is not an address', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
    expect(isPublicAddress('example.com')).toBe(false);
  });
});

describe('webhookTargetProblem', () => {
  it('names the problem with a literal target and passes a public hostname', () => {
    expect(webhookTargetProblem('http://127.0.0.1:7400/')).toBe('must be a public address');
    expect(webhookTargetProblem('http://[::1]/')).toBe('must be a public address');
    expect(webhookTargetProblem('http://localhost/')).toBe('must not point at this host');
    expect(webhookTargetProblem('http://api.localhost/')).toBe('must not point at this host');
    expect(webhookTargetProblem('ftp://example.com/')).toBe('must use http or https');
    expect(webhookTargetProblem('not a url')).toBe('must be an absolute URL');
    expect(webhookTargetProblem('https://hooks.example.com/helix')).toBeNull();
  });
});

describe('assertPublicTarget', () => {
  it('resolves the name and refuses when any answer is private', async () => {
    await expect(assertPublicTarget('https://hooks.example.com/', async () => ['93.184.216.34'])).resolves.toBeUndefined();
    await expect(assertPublicTarget('https://helix-fetch:7401/', async () => ['10.0.0.7'])).rejects.toBeInstanceOf(BlockedTargetError);
    await expect(assertPublicTarget('https://rebind.example/', async () => ['93.184.216.34', '127.0.0.1'])).rejects.toThrow(
      'private address',
    );
    await expect(assertPublicTarget('https://nowhere.example/', async () => [])).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it('does not resolve a literal address twice', async () => {
    let calls = 0;
    await assertPublicTarget('http://8.8.8.8/', async () => {
      calls += 1;
      return [];
    });
    expect(calls).toBe(0);
    await expect(assertPublicTarget('http://10.1.1.1/', async () => [])).rejects.toThrow('public address');
  });
});
