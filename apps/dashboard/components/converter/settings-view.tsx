'use client';

import { Check, ExternalLink, X } from 'lucide-react';
import { PillButton } from '@/components/converter/pill-button';
import { ProviderMark } from '@/components/converter/provider-mark';
import { AiKeyRow } from '@/components/converter/ai-key-row';
import { AI_PROVIDERS } from '@/lib/converter/ai/models';
import { PROVIDERS, ROLE_LABELS, ROLE_ORDER, providersByRole } from '@/lib/converter/providers';
import { isSoundOn, setSoundOn, useSoundOn } from '@/lib/converter/jobs/store';

export function SettingsView() {
  const sound = useSoundOn();

  return (
    <div className="mt-10 flex flex-col gap-10">
      <Section title="Sound" detail="A short chime when a job finishes or fails. Off by default.">
        <div className="flex items-center gap-3">
          <PillButton
            variant={sound ? 'primary' : 'secondary'}
            size="md"
            role="switch"
            aria-checked={sound}
            onClick={() => setSoundOn(!isSoundOn())}
          >
            {sound ? (
              <Check aria-hidden className="h-[15px] w-[15px]" />
            ) : (
              <X aria-hidden className="h-[15px] w-[15px]" />
            )}
            {sound ? 'Sound on' : 'Sound off'}
          </PillButton>
        </div>
      </Section>

      <Section
        title="What runs a conversion"
        detail="Every one of these runs inside your browser tab. Each is the real project, linked to its own site."
      >
        <div className="flex flex-col gap-7">
          {ROLE_ORDER.filter((role) => providersByRole(role).length > 0).map((role) => (
            <div key={role}>
              <h3 className="text-body font-semibold text-p-ink">{ROLE_LABELS[role]}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {providersByRole(role).map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex min-h-[44px] items-start gap-3 rounded-cv-card border border-p-line bg-p-surface px-4 py-3 transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-p-line-2 hover:shadow-card-sm"
                    >
                      <span className="mt-0.5 flex h-5 w-[52px] shrink-0 items-center justify-start">
                        <ProviderMark provider={p} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-body font-medium text-p-ink">{p.name}</span>
                        <span className="mt-0.5 block text-note text-p-ink-2">{p.summary}</span>
                      </span>
                      <ExternalLink
                        aria-hidden
                        className="mt-1 h-[14px] w-[14px] shrink-0 text-p-ink-3 transition-colors duration-150 group-hover:text-p-ink-2"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-[62ch] text-note text-p-ink-3">
          Still images go through their own WebAssembly codecs rather than FFmpeg: the jSquash
          set for JPEG, PNG, WebP and AVIF, libheif-js for reading HEIC, and UTIF2 for TIFF.
        </p>
      </Section>

      <Section
        title="Ask AI"
        detail="Turn a plain-language request into a resolved conversion, using your own provider key. Nothing here goes through Helix -- each key is stored only in this browser and sent only to that provider's own API when you use Ask AI. Clear a key if you use a shared computer."
      >
        <ul className="flex flex-col gap-2">
          {AI_PROVIDERS.map((provider) => (
            <AiKeyRow key={provider} provider={provider} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-h4 font-semibold text-p-ink">{title}</h2>
      <p className="mt-1 max-w-[62ch] text-sm text-p-ink-2">{detail}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
