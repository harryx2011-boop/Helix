import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LadderExplainer } from './ladder-explainer';

beforeEach(() => {
  // jsdom has no matchMedia; reduced motion settles on the last frame at once.
  window.matchMedia = ((query: string) =>
    ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
});
afterEach(cleanup);

describe('LadderExplainer', () => {
  it('shows the v3 rungs and settles on the browser', () => {
    const { container } = render(<LadderExplainer />);
    const text = container.textContent ?? '';
    expect(text).toContain('plain');
    expect(text).toContain('tls');
    expect(text).toContain('browser');
    expect(text).not.toMatch(/lightpanda|chromium/);
  });
});
