import type { Block } from '@/lib/docs';

const PROSE = 'text-[15px] leading-relaxed text-pretty text-m-ink/72';

export function DocBlocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        if ('p' in b) return <p key={i} className={PROSE}>{b.p}</p>;
        if ('ul' in b)
          return (
            <ul key={i} className={`${PROSE} list-disc space-y-1.5 pl-5`}>
              {b.ul.map((li) => <li key={li}>{li}</li>)}
            </ul>
          );
        if ('ol' in b)
          return (
            <ol key={i} className={`${PROSE} list-decimal space-y-1.5 pl-5`}>
              {b.ol.map((li) => <li key={li}>{li}</li>)}
            </ol>
          );
        if ('table' in b)
          return (
            <div key={i} className="overflow-x-auto rounded-card border border-m-border-muted bg-m-surface">
              <table className="w-full min-w-[32rem] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-m-border-muted">
                    {b.table.head.map((h) => (
                      <th key={h} className="px-4 py-3 font-medium text-m-ink">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.table.rows.map((row) => (
                    <tr key={row.join('|')} className="border-t border-m-border-faint align-top">
                      {row.map((cell, c) => (
                        <td key={c} className={`px-4 py-3 leading-relaxed ${c === 0 ? 'font-medium text-m-ink' : 'text-m-ink/72'}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if ('note' in b)
          return (
            <p key={i} className="rounded-card border border-violet/30 bg-violet-12 px-4 py-3 text-[14px] leading-relaxed text-m-ink">
              {b.note}
            </p>
          );
        return (
          <pre key={i} className="overflow-x-auto rounded-card border border-m-border-muted bg-m-bg-lighter px-4 py-3 font-mono text-[13px] text-m-ink">
            {b.code}
          </pre>
        );
      })}
    </div>
  );
}

export default DocBlocks;
