import type { Metadata } from 'next';
import { ApiQuickstart } from '@/components/marketing/api-quickstart';
import { API_BASE, ENDPOINTS, type FormatOp } from '@/lib/formats';

export const metadata: Metadata = {
  title: 'API · Converter API',
  description:
    'Four multipart endpoints, one job stream. Convert, compress, GIF and image over HTTP with a Helix API key.',
};

type OpDoc = {
  op: FormatOp;
  title: string;
  fields: { name: string; type: string; note: string }[];
};

const OPS: OpDoc[] = [
  {
    op: 'convert',
    title: 'Convert',
    fields: [
      { name: 'file', type: 'multipart file', note: 'Required. Video or audio, up to 5 GB.' },
      { name: 'to', type: 'enum', note: 'Required. mp4, mov, webm, avi, mkv, mp3, wav, ogg, m4a, flac, apng.' },
      { name: 'options', type: 'JSON', note: 'crf 0–51, preset, bitrate, trim {start,end}, crop, resize, rotate, flip.' },
    ],
  },
  {
    op: 'compress',
    title: 'Compress',
    fields: [
      { name: 'file', type: 'multipart file', note: 'Required. Video, MP3, WAV or an image.' },
      { name: 'target', type: 'integer bytes', note: 'Either this or preset. Wins when both are sent.' },
      { name: 'preset', type: 'enum', note: 'email, discord, web, archive.' },
      { name: 'options', type: 'JSON', note: 'Same editing keys as convert.' },
    ],
  },
  {
    op: 'gif',
    title: 'GIF',
    fields: [
      { name: 'file', type: 'multipart file', note: 'Required. A video, or several images for image → GIF.' },
      { name: 'fps', type: 'integer 1–50', note: 'Default 15.' },
      { name: 'width', type: 'integer px', note: 'Default 480. Height follows the aspect ratio.' },
      { name: 'options', type: 'JSON', note: 'trim {start,end}, loop.' },
    ],
  },
  {
    op: 'image',
    title: 'Image',
    fields: [
      { name: 'file', type: 'multipart file', note: 'Required. heic, jpg, png, webp, avif, tiff, jfif.' },
      { name: 'to', type: 'enum', note: 'Required. jpg, png, webp, avif, tiff.' },
      { name: 'resize', type: 'integer px or WxH', note: 'Longest edge, or exact box.' },
      { name: 'quality', type: 'integer 1–100', note: 'Default 82. Ignored for PNG.' },
      { name: 'options', type: 'JSON', note: 'rotate, flip, crop.' },
    ],
  },
];

const JOB_ROUTES = [
  { method: 'GET', path: '/v1/jobs/:id', note: 'Job state as JSON.' },
  { method: 'GET', path: '/v1/jobs/:id/events', note: 'Server-sent progress until done or error.' },
  { method: 'GET', path: '/v1/jobs/:id/download', note: 'The output file. Available for one hour.' },
  { method: 'DELETE', path: '/v1/jobs/:id', note: 'Cancel a running job and delete its files.' },
];

const JOB_TYPE = `type Job = {
  id: string            // cv_<nanoid>
  op: 'convert' | 'compress' | 'gif' | 'image'
  from: string; to: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  pct: number; eta: number | null
  inSize: number; outSize: number | null
  error: { message: string; stderr: string } | null
  createdAt: number; expiresAt: number   // +1h
}`;

const SSE = `data {"pct":12,"fps":48,"eta":31,"status":"running"}
data {"status":"done","url":"/v1/jobs/cv_8f2/download","size":8412934}
data {"status":"error","message":"…","stderr":"…"}`;

function Table({
  rows,
  head,
}: {
  head: [string, string, string];
  rows: { a: string; b: string; c: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-p-line">
      <table className="w-full text-left text-[14px]">
        <thead className="bg-p-code text-[12px] font-medium text-p-ink-2">
          <tr>
            <th scope="col" className="px-4 py-2">{head[0]}</th>
            <th scope="col" className="px-4 py-2">{head[1]}</th>
            <th scope="col" className="px-4 py-2">{head[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.a + r.b} className="border-t border-p-line">
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px] text-p-ink">{r.a}</td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px] text-p-ink-2">{r.b}</td>
              <td className="px-4 py-2 text-p-ink-2">{r.c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-p-ink sm:text-[40px]">API</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-p-ink-2">
            Four operations, each its own multipart POST. Every call returns{' '}
            <span className="font-mono">202 {'{ id, status: "queued" }'}</span> at once; progress
            and the file come from the job routes. Base URL{' '}
            <span className="font-mono text-p-ink">{API_BASE}</span>.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {[
                { href: '#auth', label: 'Auth and limits' },
                ...OPS.map((o) => ({ href: `#${o.op}`, label: `POST ${ENDPOINTS[o.op]}` })),
                { href: '#jobs', label: 'Jobs' },
                { href: '#events', label: 'Progress stream' },
                { href: '#retention', label: 'Retention' },
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex h-11 items-center rounded-pill px-3 font-mono text-[13px] text-p-ink-2 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-16">
            <section id="auth" aria-labelledby="auth-heading" className="scroll-mt-24">
              <h2 id="auth-heading" className="text-[22px] font-semibold tracking-[-0.01em] text-p-ink">
                Auth and limits
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-p-ink-2">
                Send your Helix key as{' '}
                <span className="font-mono text-p-ink">Authorization: Bearer hx_…</span> on every
                request. There is no anonymous access and nothing to pay for. Files up to 5 GB.
                Jobs queue in-process, <span className="font-mono">cpus − 1</span> at a time, and a
                wall-clock timeout cancels any job that stops making progress.
              </p>
            </section>

            {OPS.map((o) => (
              <section key={o.op} id={o.op} aria-labelledby={`${o.op}-heading`} className="scroll-mt-24">
                <h2 id={`${o.op}-heading`} className="flex flex-wrap items-baseline gap-x-3 text-[22px] font-semibold tracking-[-0.01em] text-p-ink">
                  {o.title}
                  <span className="font-mono text-[14px] font-medium text-p-ink-3">POST {ENDPOINTS[o.op]}</span>
                </h2>
                <div className="mt-4">
                  <Table
                    head={['Field', 'Type', 'Notes']}
                    rows={o.fields.map((f) => ({ a: f.name, b: f.type, c: f.note }))}
                  />
                </div>
                <div className="mt-6">
                  <ApiQuickstart op={o.op} />
                </div>
              </section>
            ))}

            <section id="jobs" aria-labelledby="jobs-heading" className="scroll-mt-24">
              <h2 id="jobs-heading" className="text-[22px] font-semibold tracking-[-0.01em] text-p-ink">
                Jobs
              </h2>
              <div className="mt-4">
                <Table
                  head={['Method', 'Path', 'Notes']}
                  rows={JOB_ROUTES.map((r) => ({ a: r.method, b: r.path, c: r.note }))}
                />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-card border border-p-line bg-p-code px-4 py-3 font-mono text-[13px] leading-relaxed text-p-ink">
                <code>{JOB_TYPE}</code>
              </pre>
            </section>

            <section id="events" aria-labelledby="events-heading" className="scroll-mt-24">
              <h2 id="events-heading" className="text-[22px] font-semibold tracking-[-0.01em] text-p-ink">
                Progress stream
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-p-ink-2">
                <span className="font-mono text-p-ink">GET /v1/jobs/:id/events</span> is a
                server-sent event stream. Frames arrive while ffmpeg runs, then one final frame
                with either the download URL or the error and raw stderr.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-card border border-p-line bg-p-code px-4 py-3 font-mono text-[13px] leading-relaxed text-p-ink">
                <code>{SSE}</code>
              </pre>
            </section>

            <section id="retention" aria-labelledby="retention-heading" className="scroll-mt-24">
              <h2 id="retention-heading" className="text-[22px] font-semibold tracking-[-0.01em] text-p-ink">
                Retention
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-p-ink-2">
                The input is deleted as soon as the job succeeds. The output is deleted one hour
                after that (<span className="font-mono">expiresAt</span> on the job), by a sweeper
                that runs every five minutes. The filename you send is display metadata only;
                storage uses server-generated ids.
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
