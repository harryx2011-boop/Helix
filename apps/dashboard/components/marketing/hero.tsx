import { HeroPanel } from './hero-panel';
import { CharGrid } from './char-grid';
import { PillButton } from './pill-button';
import { LadderReplayLink } from './ladder-replay-link';

const BRACKETS = [
  { label: '[ plain ]', className: 'left-6 top-24' },
  { label: '[ tls ]', className: 'right-6 top-24' },
  { label: '[ 403 ]', className: 'left-6 bottom-6' },
  { label: '[ .MD ]', className: 'right-6 bottom-6' },
];

/** WEBSITE.md §4.2. H1 + subhead + CTA pair + hero panel, over a hairline grid texture. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-32 pt-20 sm:pt-28">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--m-illus-faint)_1px,transparent_1px),linear-gradient(to_bottom,var(--m-illus-faint)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      {BRACKETS.map((b) => (
        <span
          key={b.label}
          aria-hidden="true"
          className={`absolute hidden font-mono text-[12px] tracking-wide text-m-ink/32 sm:block ${b.className}`}
        >
          {b.label}
        </span>
      ))}
      <span aria-hidden="true" className="absolute left-[18%] top-16 hidden text-violet sm:block">
        ✦
      </span>
      <span aria-hidden="true" className="absolute right-[18%] top-40 hidden text-violet sm:block">
        ✦
      </span>

      <div className="mx-auto flex max-w-container flex-col items-center px-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-pill bg-m-ink/[0.039] px-4 py-1.5 font-mono text-[13px] text-m-ink/72">
          Apache-2.0 · self-hosted · bring your own keys
          <span aria-hidden>→</span>
        </span>

        <h1 className="mt-6 max-w-[720px] text-[40px] font-normal leading-[1.05] tracking-tightest sm:text-[56px]">
          The web-data API
          <br />
          <span className="text-violet">you run yourself</span>
        </h1>

        <p className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-m-ink/72">
          An API built for agents to scour the web. Completely open source, and available for you to run locally.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/sign-up" variant="primary">
            Get an API key
          </PillButton>
          <LadderReplayLink />
        </div>

        <div className="relative mt-16 w-full max-w-[720px]">
          <CharGrid className="pointer-events-none absolute -inset-8 -z-10 hidden lg:block" />
          <HeroPanel id="ladder" />
        </div>
      </div>
    </section>
  );
}
