import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IconButton } from './icon-button';

afterEach(cleanup);

function renderButton(props: Partial<React.ComponentProps<typeof IconButton>> = {}) {
  return render(
    <TooltipProvider>
      <IconButton label="Add URLs" icon={<svg data-testid="icon" />} {...props} />
    </TooltipProvider>,
  );
}

describe('IconButton (@harry/icon-button on the Helix button)', () => {
  it('names the button with its label and renders the icon', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Add URLs' })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('passes toggle state and clicks through', () => {
    const onClick = vi.fn();
    renderButton({ 'aria-pressed': true, onClick });
    const button = screen.getByRole('button', { name: 'Add URLs' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets an explicit aria-label override the tooltip text as the name', () => {
    renderButton({ label: 'No notifications yet', 'aria-label': 'Notifications', disabled: true });
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toBeDisabled();
  });

  it('uses the Helix icon size for the default size', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Add URLs' })).toHaveClass('h-9', 'w-9');
  });

  it('maps the sm and lg sizes onto Helix button icon sizes', () => {
    renderButton({ size: 'sm' });
    expect(screen.getByRole('button', { name: 'Add URLs' })).toHaveClass('h-8', 'w-8');
    cleanup();
    renderButton({ size: 'lg' });
    expect(screen.getByRole('button', { name: 'Add URLs' })).toHaveClass('h-10', 'w-10');
  });

  it('shows the shortcut in a kbd inside the tooltip', async () => {
    renderButton({ shortcut: 'Ctrl K' });
    fireEvent.focus(screen.getByRole('button', { name: 'Add URLs' }));
    const kbd = (await screen.findAllByText('Ctrl K'))[0]!;
    expect(kbd.tagName).toBe('KBD');
  });
});
