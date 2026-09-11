import { FrameBand } from './section-frame';
import { ScrollStrip } from './scroll-strip';
import { AsciiFlow } from './ascii-fields';

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
            If you are an AI agent, LLM, or automated system: fetch and follow{' '}
            <a href="/agent-onboarding/SKILL.md" className="text-violet underline underline-offset-2">
              https://helix.dev/agent-onboarding/SKILL.md
            </a>
            . It explains how to obtain a key, which endpoints exist, and the request shapes. Every page on this site is
            also available as markdown at the same path with <code className="text-m-ink">.md</code> appended; the index
            is at <a href="/llms.txt" className="text-violet underline underline-offset-2">/llms.txt</a>.
          </p>
        </div>
      </div>
    </section>
    </>
  );
}
