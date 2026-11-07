import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Results, type PlaygroundResult } from './results';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function choose(tab: HTMLElement) {
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

const scrape: PlaygroundResult = {
  kind: 'scrape',
  response: {
    success: true,
    warnings: [],
    data: {
      markdown: '# Example Domain',
      rawHtml: `<html>${'x'.repeat(4000)}</html>`,
      metadata: { title: 'Example Domain', sourceUrl: 'https://example.com', statusCode: 200 },
    },
  },
};

const map: PlaygroundResult = {
  kind: 'map',
  response: { success: true, links: [{ url: 'https://example.com/about', title: 'About' }] },
};

function renderResult(result: PlaygroundResult, endpoint: 'scrape' | 'map') {
  return render(<Results result={result} loading={false} timingMs={49} error={undefined} endpoint={endpoint} input="https://example.com" />);
}

describe('Results view tabs (@harry/tab-bar pill)', () => {
  it('scrape: shows Markdown first with the token chip, and switches to JSON', () => {
    renderResult(scrape, 'scrape');
    const list = screen.getByRole('tablist', { name: 'Result view' });
    expect(list.closest('[data-slot="tab-bar"]')).not.toBeNull();
    const markdown = screen.getByRole('tab', { name: /Markdown/ });
    expect(markdown).toHaveAttribute('aria-selected', 'true');
    expect(markdown).toHaveTextContent(/fewer tokens/);
    expect(screen.getByRole('heading', { name: 'Example Domain' })).toBeInTheDocument();

    choose(screen.getByRole('tab', { name: 'JSON' }));
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Example Domain' })).toBeNull();
  });

  it('map: shows Links first and switches to JSON', () => {
    renderResult(map, 'map');
    const list = screen.getByRole('tablist', { name: 'Map view' });
    expect(list.closest('[data-slot="tab-bar"]')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('https://example.com/about')).toBeInTheDocument();

    choose(screen.getByRole('tab', { name: 'JSON' }));
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('https://example.com/about')).toBeNull();
  });
});
