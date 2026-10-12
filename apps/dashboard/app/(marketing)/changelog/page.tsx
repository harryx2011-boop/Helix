import * as React from 'react';
import type { Metadata } from 'next';
import { CHANGELOG, formatDate, groupBySeries, kindNote, versionId, type ChangelogEntry } from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Every released version of Helix, newest first, with its date and what changed for you.',
};

const SERIES = groupBySeries();
const NEWEST = CHANGELOG[0]!;

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto max-w-[720px] animate-fade-up">
        <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">Changelog</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-m-ink/72">
          Every released version of Helix, newest first. The latest is {NEWEST.version}, from {formatDate(NEWEST.date)}.
          Where a version was never tagged, or a tag belongs to another project, its entry says so.
        </p>
        <details className="mt-8 rounded-card border border-m-border-muted">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-[14px] font-medium text-m-ink">
            Jump to a Series
          </summary>
          <ul className="grid grid-cols-3 border-t border-m-border-muted sm:grid-cols-5">
            {SERIES.map((series) => (
              <li key={series.id}>
                <a
                  href={`#${series.id}`}
                  className="flex min-h-[44px] items-center px-4 font-mono text-[13px] text-m-ink/72 transition-colors duration-fast ease-out-strong hover:text-m-ink focus-visible:text-m-ink"
                >
                  {series.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mx-auto mt-14 max-w-[720px] space-y-14">
        {SERIES.map((series) => (
          <section key={series.id} id={series.id} aria-labelledby={`${series.id}-title`} className="scroll-mt-24">
            <h2
              id={`${series.id}-title`}
              className="border-b border-m-border-muted pb-3 text-[22px] font-normal leading-tight tracking-tight text-m-ink"
            >
              Version {series.label}
            </h2>
            <div className="divide-y divide-m-border-faint">
              {series.entries.map((entry) => (
                <Entry key={entry.version} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  const id = versionId(entry.version);
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 py-8">
      <h3 id={`${id}-title`} className="text-[18px] font-medium leading-tight tracking-tight text-m-ink">
        <a
          href={`#${id}`}
          className="inline-flex min-h-[44px] items-center transition-colors duration-fast ease-out-strong hover:text-violet focus-visible:text-violet"
        >
          {entry.version}
        </a>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 font-mono text-[12px] text-m-ink/56">
        <time dateTime={entry.date}>{formatDate(entry.date)}</time>
        <span>{kindNote(entry)}</span>
      </div>
      {entry.body.map((paragraph, i) => (
        <p key={i} className="mt-4 text-[15px] leading-relaxed text-m-ink/72">
          {i === 0 && entry.lead ? <strong className="font-medium text-m-ink">{entry.lead} </strong> : null}
          <Inline text={paragraph} />
        </p>
      ))}
    </article>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="break-words rounded-card bg-m-illus-faint px-1.5 py-0.5 font-mono text-[0.85em] text-m-ink">
            {part}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}
