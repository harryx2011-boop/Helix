import Link from 'next/link';
import { ArrowRight, HardDrive, KeyRound, UserX } from '@/components/icons/lucide';
import { FrameBand } from './section-frame';
import { IconTile } from './icon-tile';
import { AmbientCode, CodeRain } from '@/components/shared/ambient';

const POINTS = [
  {
    icon: HardDrive,
    title: 'Stored on your PC.',
    body: 'Results and settings live in Helix’s own folder on your computer. Pages are fetched over your own connection.',
  },
  {
    icon: UserX,
    title: 'No account.',
    body: 'There is nothing to sign up for. Helix makes its own access key the first time it opens.',
  },
  {
    icon: KeyRound,
    title: 'Your own AI account.',
    body: 'A few features need an AI. You connect an account you already have, or a model on your PC, and that provider bills you directly.',
  },
] as const;

/** Home §3: one benefit and the honest limit, with the long version on its own docs page. */
export function StaysOnYourPc() {
  return (
    <section className="relative overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="03" icon={HardDrive} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[760px] px-6 py-6 text-center">
          <AmbientCode
            count={16}
            seed={23}
            className="hidden -inset-y-12 -inset-x-32 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_58%,black_74%,transparent_100%)]"
          />
          <CodeRain
            cols={14}
            rows={4}
            density={0.2}
            seed={53}
            className="hidden -inset-y-6 -inset-x-16 lg:block [mask-image:radial-gradient(ellipse_at_center,transparent_45%,black_66%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[520px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Helix works on your PC,
              <br />
              <span className="text-violet">not on our servers.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-relaxed text-m-ink/72">
              Page text goes to an AI only when you ask for something that needs one, such as pulling facts into a
              table. It goes to the AI account you connected, and never to us.
            </p>
          </div>
        </div>

        <ul
          data-reveal-group
          className="mt-10 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm md:grid-cols-3"
        >
          {POINTS.map((p) => (
            <li
              key={p.title}
              data-reveal-item
              className="flex min-w-0 flex-col items-start border-b border-m-border-faint p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <IconTile icon={p.icon} size="lg" />
              <span className="mt-4 text-[17px] font-medium leading-tight tracking-tight text-m-ink">{p.title}</span>
              <span className="mt-2 text-[14px] leading-relaxed text-m-ink/64">{p.body}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/docs/privacy-and-data"
          className="group mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
        >
          What stays and what leaves
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
