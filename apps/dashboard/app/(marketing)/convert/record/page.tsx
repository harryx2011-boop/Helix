import type { Metadata } from 'next';
import { RecorderPanel } from '@/components/converter/recorder-panel';

export const metadata: Metadata = {
  title: 'Screen recorder · Converter API',
  description:
    'Record your screen for up to 30 minutes. The capture, the encoding and the file all stay in your browser.',
};

export default function RecordPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-h1lg">
        Screen recorder
      </h1>
      <p className="mt-2 max-w-[60ch] text-body text-p-ink-2">
        Capture a window, a tab or the whole screen, with or without your microphone. Nothing is
        uploaded — the recording is written to this browser as it runs, and stays there until you
        save or delete it.
      </p>

      <div className="mt-10">
        <RecorderPanel />
      </div>
    </main>
  );
}
