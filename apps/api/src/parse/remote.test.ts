import { describe, expect, it } from 'vitest';
import { assertPublicUrl, HostNotAllowedError, isPublicAddress, type Lookup } from './remote.js';

const resolvesTo =
  (...addresses: string[]): Lookup =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('isPublicAddress', () => {
  it('refuses loopback, private, link-local, CGNAT and multicast ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.8.8.8',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '64:ff9b::a00:1',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:8.8.8.8']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it('treats anything that is not an IP as not public', () => {
    expect(isPublicAddress('example.com')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('rejects schemes other than http and https', async () => {
    await expect(assertPublicUrl(new URL('ftp://example.com/a.pdf'), resolvesTo('93.184.216.34'))).rejects.toThrow(
      HostNotAllowedError,
    );
    await expect(assertPublicUrl(new URL('file:///etc/passwd'), resolvesTo('93.184.216.34'))).rejects.toThrow(
      HostNotAllowedError,
    );
  });

  it('rejects literal internal addresses without consulting the resolver', async () => {
    const lookup: Lookup = async () => {
      throw new Error('resolver must not be called');
    };
    for (const url of [
      'http://127.0.0.1:7402/health',
      'http://[::1]:7432/',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:7401/',
      'http://api.localhost/',
      'http://[::ffff:10.0.0.5]/',
    ]) {
      await expect(assertPublicUrl(new URL(url), lookup), url).rejects.toThrow(HostNotAllowedError);
    }
  });

  it('rejects a hostname when any resolved address is internal', async () => {
    await expect(
      assertPublicUrl(new URL('https://rebind.example.com/a.pdf'), resolvesTo('93.184.216.34', '10.0.0.7')),
    ).rejects.toThrow(HostNotAllowedError);
  });

  it('rejects credentials in the URL', async () => {
    await expect(assertPublicUrl(new URL('https://user:pw@example.com/a.pdf'), resolvesTo('93.184.216.34'))).rejects.toThrow(
      HostNotAllowedError,
    );
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    await expect(
      assertPublicUrl(new URL('https://example.com/a.pdf'), resolvesTo('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946')),
    ).resolves.toBeUndefined();
  });

  it('leaves resolution failures to the fetch so they keep their dns classification', async () => {
    const lookup: Lookup = async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    };
    await expect(assertPublicUrl(new URL('https://nope.invalid/a.pdf'), lookup)).resolves.toBeUndefined();
  });
});
