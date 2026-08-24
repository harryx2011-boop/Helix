import { describe, expect, it } from 'vitest';
import { checkUrl, isPrivateAddress, isPrivateHost } from './url-guard.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.0.8',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    'not-an-ip',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:93.184.216.34'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('isPrivateHost', () => {
  it.each(['http://localhost/', 'http://LOCALHOST./', 'http://api.localhost:7400/', 'http://[::1]/', 'http://10.1.1.1/'])(
    'flags %s',
    (url) => {
      expect(isPrivateHost(new URL(url))).toBe(true);
    },
  );

  it('does not resolve names', () => {
    expect(isPrivateHost(new URL('http://intranet.example/'))).toBe(false);
  });
});

describe('checkUrl', () => {
  const resolvePublic = async () => ['93.184.216.34'];

  it('accepts a public http or https URL', async () => {
    expect(await checkUrl('https://example.com/a?b=c', { resolve: resolvePublic })).toEqual({ ok: true });
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'javascript:alert(1)'])(
    'refuses the scheme of %s',
    async (url) => {
      const verdict = await checkUrl(url, { resolve: resolvePublic });
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toContain('http');
    },
  );

  it('refuses a name that resolves to a private address on any record', async () => {
    const verdict = await checkUrl('https://rebind.example/', {
      resolve: async () => ['203.0.113.1', '169.254.169.254'],
    });
    expect(verdict).toMatchObject({ ok: false });
    if (!verdict.ok) expect(verdict.reason).toContain('169.254.169.254');
  });

  it('leaves an unresolvable name to the fetch tier', async () => {
    const verdict = await checkUrl('https://does-not-exist.example/', {
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect(verdict).toEqual({ ok: true });
  });

  it('allows private targets when the operator opted in, but still only http(s)', async () => {
    expect(await checkUrl('http://10.0.0.1/', { allowPrivate: true })).toEqual({ ok: true });
    expect((await checkUrl('file:///etc/passwd', { allowPrivate: true })).ok).toBe(false);
  });
});
