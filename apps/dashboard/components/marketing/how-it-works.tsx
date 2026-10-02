import Link from 'next/link';
import { ArrowRight, Download, Link2, FileText } from 'lucide-react';
import { FrameBand } from './section-frame';
import { IconTile } from './icon-tile';
import { AsciiFlow } from '@/components/shared/ascii-fields';

const STEPS = [
  {
    icon: Download,
    title: 'Install Helix',
    body: 'One download for Windows. There is no account to create, and no setup to do before you start.',
  },
  {
    icon: Link2,
    title: 'Point it at the web',
    body: 'Paste a link, a list of links or a question. Or describe the data you want and let Helix work out the rest.',
  },
  {
    icon: FileText,
    title: 'Get something you can use',
    body: 'Clean text, tables, screenshots or a list of what changed. Results stay on your PC.',
  },
] as const;

/** Home §2: three steps. The detail lives in the docs. */
export function HowItWorks() {
  return (
    <section className="relative overflow-hidden bg-m-bg-lighter px-6 py-16 sm:px-10">
      <FrameBand step="02" icon={FileText} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <AsciiFlow
            cols={120}
            rows={18}
            seed={97}
            className="absolute -inset-x-24 -inset-y-10 hidden overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_40%,black_68%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Three steps, <span className="text-violet">no setup.</span>
            </h2>
          </div>
        </div>

        <ol
          data-reveal-group
          className="mt-10 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm md:grid-cols-3"
        >
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              data-reveal-item
              className="flex min-w-0 flex-col items-start border-b border-m-border-faint p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <span className="flex items-center gap-3">
                <IconTile icon={step.icon} size="lg" />
                <span className="text-[13px] font-medium text-m-ink/48">Step {i + 1}</span>
              </span>
              <span className="mt-4 text-[17px] font-medium leading-tight tracking-tight text-m-ink">{step.title}</span>
              <span className="mt-2 text-[14px] leading-relaxed text-m-ink/64">{step.body}</span>
            </li>
          ))}
        </ol>

        <Link
          href="/docs/quickstart"
          className="group mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
        >
          Read the quickstart
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
