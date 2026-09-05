import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShare } from '@/lib/share';
import { getRole } from '@/lib/catalog';
import { fillPlaceholders } from '@/lib/placeholders';
import { iconFor } from '@/components/icons';
import { PromptView } from '@/components/prompt-view';
import { ShareActions } from './share-actions';

export const dynamic = 'force-dynamic';

/**
 * `/s/<token>` (PERSONA.md §6): the share landing. Resolved server-side only,
 * rendered with the sharer's values already substituted, and forkable
 * without an account. Not indexed: a share is private by obscurity.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) return { robots: { index: false, follow: false } };
  return {
    title: share.title,
    description: 'A shared system prompt snapshot.',
    robots: { index: false, follow: false },
  };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) notFound();

  const role = share.roleSlug ? await getRole(share.roleSlug) : undefined;
  const Icon = role ? iconFor(role.icon) : null;
  const filled = fillPlaceholders(share.bodyMd, share.values);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          {role && Icon ? (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card"
              style={{ backgroundColor: `${role.color}1f`, color: role.color }}
            >
              <Icon className="h-5.5 w-5.5" />
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold leading-tight text-p-ink">{share.title}</h1>
              {role ? (
                <span
                  className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${role.color}1f`, color: role.color }}
                >
                  {role.name}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-p-ink-2">
              <span className="rounded-pill bg-p-code px-2 py-0.5 font-mono text-[11px] text-p-ink-2">shared · {formatDay(share.createdAt)}</span>
              A frozen snapshot. Fork it to edit your own copy.
            </p>
          </div>
        </div>
        <ShareActions share={share} filled={filled} />
      </header>

      <div className="max-w-3xl rounded-panel border border-p-line bg-p-surface p-6 shadow-card-sm">
        <PromptView body={filled} />
      </div>
    </div>
  );
}
