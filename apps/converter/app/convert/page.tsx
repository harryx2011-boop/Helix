import type { Metadata } from 'next';
import { ConverterPanel } from '@/components/converter/converter-panel';

export const metadata: Metadata = {
  title: 'Convert',
  description: 'Convert video, audio, images and GIFs. Up to 5 GB per file, deleted an hour after conversion.',
};

export default function ConvertPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-p-ink">Convert a file</h1>
      <p className="mt-1 text-sm text-p-ink-2">Video, audio, images and GIFs. Pick a format, set a size, download the result.</p>
      <div className="mt-8">
        <ConverterPanel />
      </div>
    </main>
  );
}
