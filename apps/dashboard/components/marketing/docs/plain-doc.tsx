import Link from 'next/link';
import { DocBlocks } from './doc-blocks';
import { DocsNav } from './docs-nav';
import { DOCS, type DocPage } from '@/lib/docs';

/** One plain-language docs page: sidebar, title, sections and a Next steps list. */
export function PlainDoc({ page }: { page: DocPage }) {
  return (
    <div className="mx-auto grid max-w-container gap-10 px-4 pb-24 pt-16 lg:grid-cols-[13rem_1fr] lg:gap-16 lg:pt-24">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <DocsNav />
      </aside>
      <article className="min-w-0 max-w-[44rem]">
        <span className="font-mono text-[11px] uppercase tracking-wide text-m-ink/48">{page.group}</span>
        <h1 className="mt-3 text-[36px] font-normal leading-[1.05] tracking-tighter text-balance lg:text-[44px]">{page.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-pretty text-m-ink/72">{page.intro}</p>

        {page.sections.map((s) => (
          <section key={s.h} className="mt-12">
            <h2 className="mb-4 text-[24px] font-normal leading-tight tracking-tight text-m-ink">{s.h}</h2>
            <DocBlocks blocks={s.blocks} />
          </section>
        ))}

        <section className="mt-16 border-t border-m-border-muted pt-8">
          <h2 className="mb-4 text-[24px] font-normal leading-tight tracking-tight text-m-ink">Next steps</h2>
          <ul className="flex flex-col gap-3">
            {page.next.map((n) => {
              const target = DOCS.find((d) => d.slug === n.slug);
              return target ? (
                <li key={n.slug} className="text-[15px] text-m-ink/72">
                  <Link href={`/docs/${n.slug}`} className="text-violet underline decoration-violet-40 underline-offset-4">
                    {target.nav}
                  </Link>{' '}
                  {n.why}
                </li>
              ) : null;
            })}
          </ul>
        </section>
      </article>
    </div>
  );
}
