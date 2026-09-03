import type { VersionEntry } from '@/lib/catalog';

export function VersionHistory({ history }: { history: VersionEntry[] }) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => b.version - a.version);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-p-ink-3">Version history</p>
      <ol className="flex flex-col gap-3">
        {sorted.map((entry) => (
          <li key={entry.version} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-pill bg-p-code px-2 font-mono text-[11px] font-medium text-p-ink-2">
              v{entry.version}
            </span>
            <div className="flex-1">
              <p className="text-[13px] leading-snug text-p-ink">{entry.note}</p>
              <p className="mt-0.5 text-[11.5px] text-p-ink-3">{entry.date}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
