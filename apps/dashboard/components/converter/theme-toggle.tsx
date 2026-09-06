'use client';

import { Moon, Sun } from 'lucide-react';
import { PillButton, type PillSize } from '@/components/converter/pill-button';
import { useTheme } from '@/lib/converter/theme';

export function ThemeToggle({ size = 'sm', className }: { size?: PillSize; className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <PillButton
      variant="ghost"
      size={size}
      aria-label="Dark theme"
      aria-pressed={dark}
      onClick={toggle}
      {...(className ? { className } : {})}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </PillButton>
  );
}
