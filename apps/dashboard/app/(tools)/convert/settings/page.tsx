import type { Metadata } from 'next';
import { SettingsView } from '@/components/converter/settings-view';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Sound, and what runs each conversion.',
};

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-display">
        Settings
      </h1>
      <p className="mt-2 max-w-[58ch] text-body text-p-ink-2">
        Everything here is stored in this browser. Nothing is ever sent anywhere.
      </p>
      <SettingsView />
    </main>
  );
}
