import { SectionEyebrow } from './section-eyebrow';

interface Panel {
  h3: string;
  body: string;
  demo: React.ReactNode;
}

function EscalationDemo() {
  return (
    <div className="w-full min-w-0 max-w-full font-mono text-[11px] text-m-ink/56">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-m-border-muted bg-m-border-muted">
        {[
          { t: 'plain', s: '● 403 5ms', strike: true },
          { t: 'tls', s: '● 403 51ms', strike: true },
          { t: 'lightpanda', s: '● 200 24ms', strike: false },
          { t: 'chromium', s: '○ skipped', strike: false },
        ].map((row) => (
          <div key={row.t} className="min-w-0 overflow-hidden bg-m-surface px-1 py-2 sm:px-2.5">
            <p className="truncate text-[9px] text-m-ink/40 sm:text-[11px]">{row.t}</p>
            <p className={`mt-1 truncate text-[9px] sm:text-[11px] ${row.strike ? 'text-m-ink/32 line-through' : 'text-m-ink'}`}>{row.s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentsDemo() {
  return (
    <div className="font-mono text-[11px] text-m-ink/56">
      <p>raw html [██████████████████████████] 14.2kb</p>
      <p className="mt-1">markdown [██████████████████████████] 2.1kb (trafilatura)</p>
    </div>
  );
}

function ActionsDemo() {
  const actions = ['click', 'write', 'press', 'scroll', 'extract'];
  return (
    <ul className="font-mono text-[11px] text-m-ink/56">
      {actions.map((a) => (
        <li key={a}>● {a}</li>
      ))}
    </ul>
  );
}

function PolitenessDemo() {
  return (
    <div className="font-mono text-[11px] text-m-ink/56">
      <p>├─● /pricing</p>
      <p>├─● /docs</p>
      <p>└─○ /about <span className="text-m-ink/32">(queued, host at concurrency limit)</span></p>
    </div>
  );
}

function HonestFailureDemo() {
  return (
    <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-m-ink/56">
{`{
  "success": false,
  "reason": "FetchFailure",
  "detectedBy": ["cloudflare-mitigated"]
}`}
    </pre>
  );
}

const PANELS: Panel[] = [
  { h3: 'Cheapest tier first.', body: 'Plain fetch, then TLS identity, then a lightweight browser, then Chromium. Helix escalates on evidence, never on framework detection.', demo: <EscalationDemo /> },
  { h3: 'Documents read like pages.', body: 'PDF, DOCX, PPTX, XLSX. OCR routes in only when the text layer is missing or garbled.', demo: <DocumentsDemo /> },
  { h3: 'Act before you read.', body: 'Click, write, press, scroll, wait, screenshot, run JavaScript. Then extract.', demo: <ActionsDemo /> },
  { h3: 'Polite by default.', body: 'robots.txt honoured, per-host concurrency that backs off on 429 and 5xx.', demo: <PolitenessDemo /> },
  { h3: 'A block is a failure, not a document.', body: 'A challenge page returning 200 comes back as a typed failure with the signals that fired, never as markdown.', demo: <HonestFailureDemo /> },
];

/** WEBSITE.md §4.4: 5 panels, 2-col, small character-art demos. Carries the first "X, not Y" line. */
export function ObjectionA() {
  return (
    <section className="border-t border-m-border-faint px-4 py-20">
      <div className="mx-auto max-w-container">
        <SectionEyebrow step="02 / 05" label="COVERAGE" sub="Zero configuration" />
        <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Built for the web as it is.
        </h2>
        <p className="mt-3 max-w-[520px] text-[16px] leading-relaxed text-m-ink/72">
          JavaScript, documents, forms, rate limits and block pages. Handled, and reported honestly.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {PANELS.map((p, i) => (
            <div
              key={p.h3}
              style={{ animationDelay: `${i * 60}ms` }}
              className="min-w-0 animate-fade-up rounded-card border border-m-border-muted bg-m-surface p-6"
            >
              <h3 className="text-[20px] font-medium leading-tight tracking-tight">{p.h3}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-m-ink/64">
                {p.body}
                {p.h3.startsWith('A block') && <span className="block text-m-ink/48">A block is a failure, not a document.</span>}
              </p>
              <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-card bg-m-bg-lighter p-3">{p.demo}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
