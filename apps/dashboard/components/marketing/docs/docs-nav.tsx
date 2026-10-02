'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS } from '@/lib/docs';

const GROUPS = [...new Set(DOCS.map((d) => d.group))];

const DEVELOPER_LINKS = [
  { href: '/docs', label: 'Developer Hub' },
  { href: '/docs/api-reference', label: 'API Reference' },
  { href: '/self-host', label: 'Run It From Source' },
];

const LINK = 'rounded-card px-3 py-2 text-[14px] transition-colors duration-200 hover:text-m-ink';

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs" className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-1">
          <span className="px-3 pb-1 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">{group}</span>
          {DOCS.filter((d) => d.group === group).map((d) => {
            const href = `/docs/${d.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={d.slug}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${LINK} ${active ? 'bg-m-ink/[0.059] text-m-ink' : 'text-m-ink/64'}`}
              >
                {d.nav}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <span className="px-3 pb-1 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">For Developers</span>
        {DEVELOPER_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`${LINK} text-m-ink/64`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default DocsNav;
