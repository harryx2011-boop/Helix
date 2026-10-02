import { FrameBand } from './section-frame';
import { ScrollStrip } from './scroll-strip';
import { AsciiFlow } from '@/components/shared/ascii-fields';
import { SITE_URL } from '@/lib/mode';

/** WEBSITE.md §4.8. Ends every marketing page. Mono panel pointing agents at the onboarding skill. */
export function AgentBlock() {
  return (
    <>
    <ScrollStrip seed={19} direction="right" />
    <section className="bg-m-bg-lighter px-6 py-16 sm:px-10">
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] overflow-hidden lg:block [mask-image:linear-gradient(to_right,transparent,black_35%)]"
        >
          <AsciiFlow cols={96} rows={5} seed={23} className="absolute right-0 top-0 opacity-70" />
        </div>
        <FrameBand />
      </div>
      <div className="py-10">
        <div className="rounded-panel border border-m-border-muted bg-m-surface p-6 font-mono text-[13px] leading-relaxed text-m-ink/72">
          <p>
            If you are an AI assistant or an automated tool: fetch and follow{' '}
            <a href="/agent-onboarding/SKILL.md" className="text-violet underline underline-offset-2">
              {SITE_URL.replace(/\/$/, '')}/agent-onboarding/SKILL.md
            </a>
            . It explains how to get a key, what Helix can do, and how to ask for it. Every page on this site is also
            available as plain text at the same address with <code className="text-m-ink">.md</code> added; the index is
            at <a href="/llms.txt" className="text-violet underline underline-offset-2">/llms.txt</a>.
          </p>
        </div>
      </div>
    </section>
    </>
  );
}
