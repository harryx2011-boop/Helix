'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { KeyMenu } from './key-menu';
import { Logo } from './logo';

const LINKS = [
  { href: '/', label: 'Playground' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/keys', label: 'Keys' },
  { href: '/health', label: 'Health' },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-6">
        <Link href="/" aria-label="Helix — playground">
          <Logo className="h-7 w-auto text-foreground" />
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <KeyMenu />
    </header>
  );
}
