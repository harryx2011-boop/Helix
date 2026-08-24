import { describe, expect, it } from 'vitest';
import { UnsafeUrlError, assertPublicUrl, isPublicAddress } from './url-guard.js';

const resolving = (addresses: Record<string, string[]>) => async (hostname: string) => {
  const found = addresses[hostname];
  if (!found) throw new Error('ENOTFOUND');
  return found.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('assertPublicUrl', () => {
  const lookup = resolving({
    'example.com': ['93.184.216.34'],
    'metadata.google.internal': ['169.254.169.254'],
    'intranet.corp': ['10.0.0.5'],
    'mixed.example': ['93.184.216.34', '192.168.1.1'],
    'v6.example': ['2606:2800:220:1:248:1893:25c8:1946'],
  });

  it('accepts a public hostname over http or https', async () => {
    await expect(assertPublicUrl('https://example.com/shop', lookup)).resolves.toBeUndefined();
    await expect(assertPublicUrl('http://v6.example/', lookup)).resolves.toBeUndefined();
  });

  it('refuses schemes that are not http(s)', async () => {
    await expect(assertPublicUrl('file:///etc/passwd', lookup)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl('ftp://example.com/', lookup)).rejects.toThrow(/only http and https/);
  });

  it('refuses localhost, loopback, link-local and private ranges by address', async () => {
    for (const url of [
      'http://localhost:7402/health',
      'http://api.localhost/',
      'http://127.0.0.1:7401/',
      'http://127.8.8.8/',
      'http://0.0.0.0/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.1.2.3/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.0.1/',
      'http://100.64.0.1/',
      'http://[::1]:7400/',
      'http://[::ffff:127.0.0.1]/',
      'http://[fe80::1]/',
      'http://[fd00::1]/',
    ]) {
      await expect(assertPublicUrl(url, lookup), url).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it('refuses a hostname that resolves inward, even when one answer is public', async () => {
    await expect(assertPublicUrl('http://metadata.google.internal/', lookup)).rejects.toThrow(/169\.254\.169\.254/);
    await expect(assertPublicUrl('http://intranet.corp:7402/', lookup)).rejects.toThrow(/not a public address/);
    await expect(assertPublicUrl('http://mixed.example/', lookup)).rejects.toThrow(/192\.168\.1\.1/);
  });

  it('refuses a hostname that does not resolve rather than letting the browser try', async () => {
    await expect(assertPublicUrl('http://nope.invalid/', lookup)).rejects.toThrow(/did not resolve/);
  });
});

describe('isPublicAddress', () => {
  it('classifies the edges of each range', () => {
    expect(isPublicAddress('172.15.255.255')).toBe(true);
    expect(isPublicAddress('172.32.0.0')).toBe(true);
    expect(isPublicAddress('100.63.255.255')).toBe(true);
    expect(isPublicAddress('100.128.0.0')).toBe(true);
    expect(isPublicAddress('223.255.255.255')).toBe(true);
    expect(isPublicAddress('224.0.0.1')).toBe(false);
    expect(isPublicAddress('2001:db8::1')).toBe(false);
    expect(isPublicAddress('64:ff9b::7f00:1')).toBe(false);
    expect(isPublicAddress('not-an-ip')).toBe(false);
  });
});
