'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { ProviderMark } from '@/components/site/provider-mark';
import { KeyGate } from '@/components/site/key-gate';
import { useApiKey } from '@/lib/auth';
import { API_BASE } from '@/lib/formats';
import { PROVIDERS, ROLE_LABELS, ROLE_ORDER, providersByRole } from '@/lib/providers';
import { isSoundOn, setSoundOn, useSoundOn } from '@/lib/jobs/store';

type Health = { status: string; auth: boolean; concurrency: number; queued: number };

export function SettingsView() {
  const key = useApiKey();
  const sound = useSoundOn();
  const [health, setHealth] = useState<Health | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((h: Health) => {
        if (!cancelled) {
          setHealth(h);
          setReachable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReachable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-10 flex flex-col gap-10">
      <Section
        title="API key"
        detail="Conversions are authorised with a Helix key. It is kept in this browser and sent only to the converter service."
      >
        <KeyGate />
        {key ? (
          <p className="mt-3 flex items-center gap-1.5 text-note text-p-ink-2">
            <Check aria-hidden className="h-[14px] w-[14px]" />
            Saved on this device.
          </p>
        ) : null}
      </Section>

      <Section title="Service" detail="Where conversions run, and whether it is answering.">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Endpoint" value={API_BASE} mono />
          <Row
            label="Reachable"
            value={reachable === null ? 'checking…' : reachable ? 'yes' : 'no'}
            tone={reachable === false ? 'bad' : undefined}
          />
          <Row
            label="Requires a key"
            value={health ? (health.auth ? 'yes' : 'no, running open') : '—'}
            tone={health && !health.auth ? 'warn' : undefined}
          />
          <Row label="Concurrent jobs" value={health ? String(health.concurrency) : '—'} mono />
        </dl>
        {reachable === false ? (
          <p className="mt-4 text-note text-p-ink-2">
            Nothing answered at that address. Start the service, or set{' '}
            <code className="rounded bg-p-code px-1.5 py-0.5 font-mono text-caption">
              NEXT_PUBLIC_CONVERTER_API
            </code>{' '}
            to where it runs.
          </p>
        ) : null}
      </Section>

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
        detail="Converter API is a thin layer over these. Each is the real project, linked to its own site."
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
                      className="group flex min-h-[44px] items-start gap-3 rounded-card border border-p-line bg-p-surface px-4 py-3 transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-p-line-2 hover:shadow-card-sm"
                    >
                      <span className="mt-0.5 flex h-5 w-[52px] shrink-0 items-center justify-start">
                        <ProviderMark provider={p} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-medium text-p-ink">{p.name}</span>
                          {p.handles?.map((op) => (
                            <code
                              key={op}
                              className="rounded-pill bg-p-code px-2 py-0.5 font-mono text-micro text-p-ink-2"
                            >
                              /v1/{op}
                            </code>
                          ))}
                        </span>
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
        <p className="mt-5 text-note text-p-ink-3">
          {PROVIDERS.length} projects. Formats depend on how FFmpeg and libvips were built on the
          machine running the service.
        </p>
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

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  // exactOptionalPropertyTypes is on, so a conditionally-computed tone has to
  // be allowed to be undefined rather than merely absent.
  tone?: 'bad' | 'warn' | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-p-line py-2">
      <dt className="text-sm text-p-ink-2">{label}</dt>
      <dd
        className={[
          'truncate text-right text-sm',
          mono ? 'font-mono text-note' : '',
          tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-p-ink-2' : 'text-p-ink',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
