import { describe, expect, it } from 'vitest';
import { browserUrl } from './init.js';

describe('browserUrl', () => {
  it('opens the download page, since the website no longer hosts the app', () => {
    expect(browserUrl('https://helixapi-dev.vercel.app')).toBe('https://helixapi-dev.vercel.app/download');
  });

  it('does not double the slash when the site URL ends in one', () => {
    expect(browserUrl('https://helixapi-dev.vercel.app/')).toBe('https://helixapi-dev.vercel.app/download');
  });
});
