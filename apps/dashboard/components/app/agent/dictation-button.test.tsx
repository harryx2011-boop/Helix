import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const dictation = vi.hoisted(() => ({
  current: { state: 'idle', partial: '', error: null as string | null },
  toggle: vi.fn(),
  options: null as null | { connect: () => Promise<unknown>; onText: (t: string) => void },
}));

vi.mock('@/lib/voice-core/react', () => ({
  useDictation: (options: NonNullable<typeof dictation.options>) => {
    dictation.options = options;
    return { ...dictation.current, start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), toggle: dictation.toggle };
  },
}));

const { DictationButton, joinDictation } = await import('./dictation-button');
const { TooltipProvider } = await import('@/components/ui/tooltip');

const connection = { baseUrl: 'http://127.0.0.1:9000', token: 't' };

function installBridge(voice?: { connect: () => Promise<unknown> }) {
  window.helixDesktop = { apiKey: 'k', adminToken: 'a', version: '2.1.0', platform: 'win32', ...(voice ? { voice } : {}) };
}

function renderButton(props: Partial<React.ComponentProps<typeof DictationButton>> = {}) {
  return render(
    <TooltipProvider>
      <DictationButton onText={vi.fn()} {...props} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  dictation.current = { state: 'idle', partial: '', error: null };
  dictation.toggle.mockClear();
  dictation.options = null;
});

afterEach(() => {
  cleanup();
  delete window.helixDesktop;
});

describe('joinDictation', () => {
  it('starts the text or continues it with one space', () => {
    expect(joinDictation('', 'open the pricing page')).toBe('open the pricing page');
    expect(joinDictation('Find the', 'price of a plan')).toBe('Find the price of a plan');
  });

  it('adds no second space after whitespace, and ignores an empty transcript', () => {
    expect(joinDictation('Find the ', 'price')).toBe('Find the price');
    expect(joinDictation('line one\n', 'line two')).toBe('line one\nline two');
    expect(joinDictation('unchanged', '   ')).toBe('unchanged');
  });

  it('trims the transcript', () => {
    expect(joinDictation('a', '  b  ')).toBe('a b');
  });
});

describe('the mic in the composer', () => {
  it('is absent in a browser, where no local speech service exists', () => {
    renderButton();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is absent in a desktop build that has no voice bridge', async () => {
    installBridge();
    renderButton();
    await Promise.resolve();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows in the desktop app and toggles dictation on click', async () => {
    installBridge({ connect: async () => connection });
    renderButton();
    const button = await screen.findByRole('button', { name: 'Dictate' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(dictation.toggle).toHaveBeenCalledOnce();
  });

  it('connects through the bridge and refuses a reply that is not a loopback connection', async () => {
    const reply = vi.fn(async (): Promise<unknown> => connection);
    installBridge({ connect: reply });
    renderButton();
    await screen.findByRole('button');
    await expect(dictation.options!.connect()).resolves.toEqual(connection);
    reply.mockResolvedValueOnce({ baseUrl: 'http://example.com:9000', token: 't' });
    await expect(dictation.options!.connect()).resolves.toBeNull();
    reply.mockResolvedValueOnce(null);
    await expect(dictation.options!.connect()).resolves.toBeNull();
  });

  it('hands each transcript to the caller', async () => {
    installBridge({ connect: async () => connection });
    const onText = vi.fn();
    renderButton({ onText });
    await screen.findByRole('button');
    dictation.options!.onText('hello there');
    expect(onText).toHaveBeenCalledWith('hello there');
  });

  it.each([
    ['starting', 'Getting ready', { busy: true, disabled: false }],
    ['listening', 'Stop dictating', { busy: false, disabled: false }],
    ['transcribing', 'Transcribing', { busy: true, disabled: true }],
    ['error', 'Dictate again', { busy: false, disabled: false }],
  ] as const)('reports %s to assistive technology', async (state, name, flags) => {
    installBridge({ connect: async () => connection });
    dictation.current = { state, partial: '', error: state === 'error' ? 'No microphone found.' : null };
    renderButton();
    const button = await screen.findByRole('button', { name });
    expect(button).toHaveAttribute('aria-busy', String(flags.busy));
    expect(button).toHaveAttribute('aria-pressed', String(state === 'listening'));
    expect(button.hasAttribute('disabled')).toBe(flags.disabled);
  });

  it('captions what it hears while listening, and the reason after an error', async () => {
    installBridge({ connect: async () => connection });
    const onCaption = vi.fn();
    dictation.current = { state: 'listening', partial: 'open the pri', error: null };
    const { rerender } = renderButton({ onCaption });
    await waitFor(() => expect(onCaption).toHaveBeenLastCalledWith({ text: 'open the pri', error: false }));

    dictation.current = { state: 'error', partial: '', error: 'No microphone found.' };
    rerender(
      <TooltipProvider>
        <DictationButton onText={vi.fn()} onCaption={onCaption} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(onCaption).toHaveBeenLastCalledWith({ text: 'No microphone found.', error: true }));

    dictation.current = { state: 'idle', partial: '', error: null };
    rerender(
      <TooltipProvider>
        <DictationButton onText={vi.fn()} onCaption={onCaption} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(onCaption).toHaveBeenLastCalledWith(null));
  });
});
