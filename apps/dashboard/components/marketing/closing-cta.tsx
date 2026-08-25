import { PillButton } from './pill-button';
import { GithubMark } from './github-mark';

/** Final section: repeats the hero's CTA pair on a quiet, bordered ground. No stats, no logos. */
export function ClosingCta() {
  return (
    <section className="border-t border-m-border-faint px-4 py-24">
      <div data-reveal className="mx-auto flex max-w-container flex-col items-center text-center">
        <h2 className="max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Run the web-data API on your own terms.
        </h2>
        <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
          Apache-2.0, self-hosted, bring your own keys. Or start with a hosted key in under a minute.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/sign-up" variant="primary">
            Get started
          </PillButton>
          <PillButton href="https://github.com/helix-dev/helix" variant="secondary">
            <GithubMark className="h-4 w-4" />
            View on GitHub
          </PillButton>
        </div>
      </div>
    </section>
  );
}
