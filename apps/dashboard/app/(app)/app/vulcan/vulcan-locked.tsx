import { Lock } from 'lucide-react';
import { PageFrame, FrameRow } from '@/components/app/page-frame';
import { AsciiFire } from '@/components/vulcan/ascii-fire';
import { VulcanFlame } from '@/components/vulcan/vulcan-flame';

/**
 * What /app/vulcan shows when the server is not being reached on localhost:
 * the same header as the live page, then the reason, instead of a 404 that
 * would make the sidebar row look broken.
 */
export function VulcanLocked() {
  return (
    <div data-surface="vulcan" className="min-h-full text-foreground">
      <PageFrame>
        <FrameRow className="overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 w-[30rem]"
              style={{ background: 'radial-gradient(ellipse 60% 120% at 6% 50%, hsl(var(--primary) / 0.14), transparent 70%)' }}
            />
            <AsciiFire cols={38} rows={8} className="absolute bottom-0 left-[35rem] opacity-75" />
            <AsciiFire cols={16} rows={6} seed={19} className="absolute bottom-0 right-[21rem] opacity-35" />
          </div>
          <div className="relative flex items-center gap-3 px-6 py-5">
            <VulcanFlame className="h-9 w-9" />
            <div className="min-w-0">
              <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">Vulcan</h2>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">Claude Code spend, read from the transcripts on this machine.</p>
            </div>
          </div>
        </FrameRow>
        <FrameRow flush>
          <div className="flex flex-col items-start gap-5 px-6 py-10">
            <div className="flex max-w-[560px] gap-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
              <div>
                <h2 className="text-[17px] font-medium leading-tight tracking-tight text-foreground">Available on localhost only</h2>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Vulcan reads the Claude Code transcripts in the home directory of the machine running this server, so it only
                  opens when the dashboard is served from your own computer. Run the dashboard locally and open it there.
                </p>
              </div>
            </div>
            <pre className="rounded-card border border-border bg-card px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground">
              <code>{'pnpm --filter @helix/dashboard dev\nhttp://localhost:3400/app/vulcan'}</code>
            </pre>
          </div>
        </FrameRow>
      </PageFrame>
    </div>
  );
}
