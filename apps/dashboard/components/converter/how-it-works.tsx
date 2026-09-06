import { ArrowRight, Download, Upload } from 'lucide-react';
import { PillButton } from '@/components/converter/pill-button';

function DropIllustration() {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-cv-panel border border-dashed border-p-line-2 bg-p-surface text-center">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-pill bg-p-code text-p-ink-2">
        <Upload className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-note font-medium text-p-ink">Drop a file here</span>
      <span className="text-micro text-p-ink-3">Up to 2 GB</span>
    </div>
  );
}

function SettingsIllustration() {
  return (
    <div className="flex h-40 flex-col justify-center gap-3 rounded-cv-panel border border-p-line bg-p-surface p-4">
      <div className="flex items-center justify-between gap-3 rounded-cv-card border border-p-line bg-p-bg px-3 py-2">
        <span className="truncate font-mono text-caption text-p-ink">interview.mov</span>
        <span className="font-mono text-micro text-p-ink-3">1.2 GB</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
        <PillButton variant="primary" size="sm">
          MP4
        </PillButton>
        <PillButton variant="secondary" size="sm">
          MP3
        </PillButton>
        <PillButton variant="secondary" size="sm">
          GIF
        </PillButton>
        <PillButton variant="ghost" size="sm">
          More
        </PillButton>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-micro text-p-ink-3">Quality</span>
        <div className="relative h-1.5 flex-1 rounded-pill bg-p-code">
          <div className="absolute inset-y-0 left-0 w-[62%] rounded-pill bg-blue" />
          <div className="absolute left-[62%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-white shadow-card" />
        </div>
        <span className="font-mono text-micro text-p-ink-2">23</span>
      </div>
    </div>
  );
}

function DownloadIllustration() {
  return (
    <div className="flex h-40 flex-col justify-center gap-3 rounded-cv-panel border border-p-line bg-p-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-caption text-p-ink">interview.mp4</span>
        <span className="font-mono text-micro text-p-ink-3">done</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-p-code">
        <div className="h-full w-full rounded-pill bg-blue" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-micro text-p-ink-2">
          1.2 GB <ArrowRight className="inline h-3 w-3 text-p-ink-3" aria-hidden="true" /> 184 MB
        </span>
        <span aria-hidden="true">
          <PillButton variant="primary" size="sm">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </PillButton>
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Drop a file',
    body: 'Drag it in or pick it from disk. It streams to the server as it is; nothing is stored in your browser.',
    Illustration: DropIllustration,
  },
  {
    title: 'Pick the output',
    body: 'Likely targets come first as pills. Trim, crop, resize and quality live in the same row, and run as one ffmpeg pass.',
    Illustration: SettingsIllustration,
  },
  {
    title: 'Download',
    body: 'Progress streams live with an ETA. When it finishes, the button turns into the download, with the new size next to the old.',
    Illustration: DownloadIllustration,
  },
];

/** Three steps, each illustrated with the converter's own pieces. */
export function HowItWorks() {
  return (
    <ol className="grid gap-8 md:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex flex-col gap-4">
          <s.Illustration />
          <div>
            <h3 className="flex items-baseline gap-2 text-lead font-semibold text-p-ink">
              {s.title}
              <span className="font-mono text-caption font-medium text-p-ink-3">{i + 1}/3</span>
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-p-ink-2">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
