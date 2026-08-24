import { describe, expect, it } from 'vitest';
import {
  isPublicAddress,
  resolvedTargetProblem,
  webhookHeadersProblem,
  webhookTargetProblem,
} from './target.js';

describe('isPublicAddress', () => {
  it('rejects loopback, private, link-local and reserved IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '127.9.9.9',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('accepts routable IPv4 addresses', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('172.32.0.1')).toBe(true);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });

  it('rejects loopback, unique-local, link-local and mapped IPv6 addresses', () => {
    for (const address of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '0:0:0:0:0:ffff:a00:1',
      '64:ff9b::7f00:1',
      '2002:7f00:1::',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('accepts routable IPv6 addresses', () => {
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
    expect(isPublicAddress('::ffff:93.184.216.34')).toBe(true);
  });

  it('treats anything that is not an address as not public', () => {
    expect(isPublicAddress('example.com')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});

describe('webhookTargetProblem', () => {
  it('accepts a public https or http URL', () => {
    expect(webhookTargetProblem('https://myapp.example/webhooks/helix')).toBeUndefined();
    expect(webhookTargetProblem('http://93.184.216.34:8080/hook')).toBeUndefined();
  });

  it('rejects schemes fetch cannot send to', () => {
    expect(webhookTargetProblem('ftp://example.com/x')).toBe('must use http or https');
    expect(webhookTargetProblem('mailto:ops@example.com')).toBe('must use http or https');
    expect(webhookTargetProblem('javascript:alert(1)')).toBe('must use http or https');
  });

  it('rejects the deployment network', () => {
    // The fetch and extract services, the API itself, the database.
    expect(webhookTargetProblem('http://localhost:7401/')).toBeDefined();
    expect(webhookTargetProblem('http://127.0.0.1:7400/v1/internal/keys')).toBeDefined();
    expect(webhookTargetProblem('http://helix-extract:7402/')).toBeDefined();
    expect(webhookTargetProblem('http://postgres:5432/')).toBeDefined();
    expect(webhookTargetProblem('http://[::1]:7400/')).toBeDefined();
    expect(webhookTargetProblem('http://169.254.169.254/latest/meta-data/')).toBeDefined();
    expect(webhookTargetProblem('http://api.internal/')).toBeDefined();
    expect(webhookTargetProblem('http://printer.local/')).toBeDefined();
  });

  it('rejects credentials in the URL', () => {
    expect(webhookTargetProblem('https://user:pw@myapp.example/hook')).toBe('must not carry credentials');
  });
});

describe('webhookHeadersProblem', () => {
  it('accepts ordinary headers', () => {
    expect(webhookHeadersProblem({ 'x-tenant': 'a', Authorization: 'Bearer t' })).toBeUndefined();
  });

  it('rejects names and values fetch would throw on', () => {
    expect(webhookHeadersProblem({ 'bad header': 'x' })).toContain('not a valid header name');
    expect(webhookHeadersProblem({ 'x-a': 'line\nbreak' })).toContain('invalid header value');
  });

  it('refuses to override what Helix sets', () => {
    expect(webhookHeadersProblem({ 'Content-Type': 'text/plain' })).toContain('cannot be overridden');
    expect(webhookHeadersProblem({ host: 'internal' })).toContain('cannot be overridden');
    expect(webhookHeadersProblem({ 'helix-signature': 'forged' })).toContain('cannot be overridden');
  });

  it('bounds the count and size', () => {
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`x-${i}`, 'v']));
    expect(webhookHeadersProblem(many)).toContain('at most 16');
    expect(webhookHeadersProblem({ 'x-big': 'v'.repeat(5_000) })).toContain('at most 4096 bytes');
  });
});

describe('resolvedTargetProblem', () => {
  it('rejects a public name that resolves to a private address', async () => {
    const problem = await resolvedTargetProblem('https://h.example/hook', async () => ['10.0.0.5']);
    expect(problem).toBe('resolves to a private or loopback address');
  });

  it('rejects when any resolved address is private', async () => {
    const problem = await resolvedTargetProblem('https://h.example/hook', async () => ['93.184.216.34', '::1']);
    expect(problem).toBeDefined();
  });

  it('accepts a name that resolves publicly and gives no verdict on a lookup failure', async () => {
    expect(await resolvedTargetProblem('https://h.example/hook', async () => ['93.184.216.34'])).toBeUndefined();
    expect(
      await resolvedTargetProblem('https://h.example/hook', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).toBeUndefined();
  });

  it('does not look up an IP literal', async () => {
    let looked = false;
    const problem = await resolvedTargetProblem('http://93.184.216.34/hook', async () => {
      looked = true;
      return [];
    });
    expect(problem).toBeUndefined();
    expect(looked).toBe(false);
  });
});
