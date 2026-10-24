import { describe, expect, it } from 'vitest';
import {
  UnsafeUrlError,
  assertPublicUrl,
  checkUrl,
  isPrivateAddress,
  isPrivateHost,
  isPublicAddress,
  pinProxyUrl,
} from './url-guard.js';

describe('pinProxyUrl', () => {
  it('keeps an https proxy on its name, which its certificate is issued to', async () => {
    expect(await pinProxyUrl('https://proxy.example:443', { resolve: async () => ['93.184.216.34'] })).toEqual({
      ok: true,
      url: 'https://proxy.example:443',
    });
  });

  it('brackets an IPv6 answer and keeps the credentials', async () => {
    const pinned = await pinProxyUrl('http://u:p@proxy.example:3128', { resolve: async () => ['2606:4700::1111'] });
    expect(pinned).toEqual({ ok: true, url: 'http://u:p@[2606:4700::1111]:3128' });
  });

  it('resolves the name once for both the check and the pin', async () => {
    let calls = 0;
    await pinProxyUrl('http://proxy.example:3128', {
      resolve: async () => {
        calls++;
        return ['93.184.216.34'];
      },
    });
    expect(calls).toBe(1);
  });

  const failsOnceThenLinkLocal = () => {
    let calls = 0;
    return async () => {
      if (calls++ === 0) throw new Error('EAI_AGAIN');
      return ['169.254.169.254'];
    };
  };

  it('refuses a proxy whose first lookup fails and whose second answers a private address', async () => {
    const pinned = await pinProxyUrl('http://proxy.example:3128', { resolve: failsOnceThenLinkLocal() });
    expect(pinned.ok).toBe(false);
  });

  it('keeps link-local out of a pin even where private targets are allowed', async () => {
    const pinned = await pinProxyUrl('http://proxy.example:3128', {
      allowPrivate: true,
      resolve: failsOnceThenLinkLocal(),
    });
    expect(pinned.ok).toBe(false);
  });

  it('refuses a proxy whose lookup always fails', async () => {
    const pinned = await pinProxyUrl('http://proxy.example:3128', {
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect(pinned.ok).toBe(false);
  });

  it('pins a loopback answer when private targets are allowed', async () => {
    const pinned = await pinProxyUrl('http://proxy.example:3128', {
      allowPrivate: true,
      resolve: async () => ['127.0.0.1'],
    });
    expect(pinned).toEqual({ ok: true, url: 'http://127.0.0.1:3128' });
  });
});

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

describe('IPv6 forms that carry or name a non-public address', () => {
  it.each(['::7f00:1', '::a9fe:a9fe', 'fec0::1', 'feff::1', '2002:7f00:1::', '2002:a9fe:a9fe::1', '2002:c0a8:101::'])(
    'treats %s as private',
    (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    },
  );

  it.each(['2002:5db8:d822::1', '2606:4700::1111'])('still treats %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
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

  // Link-local carries the cloud metadata endpoint and CGNAT is the carrier's
  // space: neither is a private target anyone opted in to.
  it.each(['http://169.254.169.254/', 'http://100.64.0.1/', 'http://[::ffff:169.254.169.254]/', 'http://[fe80::1]/'])(
    'refuses the always-blocked address %s even when private targets are allowed',
    async (url) => {
      expect((await checkUrl(url, { allowPrivate: true })).ok).toBe(false);
    },
  );

  it('refuses a name resolving to an always-blocked address even when private targets are allowed', async () => {
    const verdict = await checkUrl('http://ollama.lan:11434/', {
      allowPrivate: true,
      resolve: async () => ['169.254.169.254'],
    });
    expect(verdict.ok).toBe(false);
  });

  it('still allows a name resolving to the LAN when private targets are allowed', async () => {
    const verdict = await checkUrl('http://ollama.lan:11434/', { allowPrivate: true, resolve: async () => ['192.168.1.20'] });
    expect(verdict).toEqual({ ok: true });
  });
});

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
