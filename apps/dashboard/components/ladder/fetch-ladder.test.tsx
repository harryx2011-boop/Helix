import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FetchLadder } from './fetch-ladder';

afterEach(cleanup);

const rungs = () => screen.getAllByRole('listitem').map((item) => item.textContent);

describe('FetchLadder', () => {
  it('shows the v3 ladder with the browser rung a result can resolve on', () => {
    render(<FetchLadder tiersAttempted={['tls', 'browser']} resolvedTier="browser" />);
    expect(rungs()).toEqual(['plain→', 'tls→', 'browser']);
    expect(screen.getByText('browser')).toHaveClass('text-success');
  });

  it('still shows the retired rungs an older stored result walked', () => {
    render(<FetchLadder tiersAttempted={['plain', 'lightpanda', 'chromium']} resolvedTier="chromium" />);
    expect(rungs()).toEqual(['plain→', 'tls→', 'lightpanda→', 'chromium→', 'browser']);
    expect(screen.getByText('chromium')).toHaveClass('text-success');
  });
});
