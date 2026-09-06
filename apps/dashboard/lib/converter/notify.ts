'use client';

import { formatBytes, formatDelta } from '@/lib/converter/jobs/types';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Call only from a user gesture (the first Convert click). Never on load. */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function show(title: string, body: string, tag: string, onClick: () => void): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  let n: Notification;
  try {
    n = new Notification(title, { body, tag });
  } catch {
    return;
  }
  n.onclick = () => {
    window.focus();
    n.close();
    onClick();
  };
}

export type CompletedItem = {
  localId: string;
  name: string;
  ok: boolean;
  inSize: number;
  outSize: number | null;
};

/**
 * One notification per completed job; a batch of two or more collapses to a
 * single batch-complete notification. `focusRow` receives the localId to
 * scroll to when the notification is clicked.
 */
export function notifyCompletion(items: CompletedItem[], focusRow: (localId: string) => void): void {
  if (items.length === 0) return;
  const first = items[0];
  if (!first) return;
  if (items.length === 1) {
    const sizeLine =
      first.ok && first.outSize !== null
        ? `${formatBytes(first.outSize)} (${formatDelta(first.inSize, first.outSize)})`
        : 'Conversion failed';
    show(first.ok ? 'Ready to download' : 'Conversion failed', `${first.name} · ${sizeLine}`, `job-${first.localId}`, () =>
      focusRow(first.localId),
    );
    return;
  }
  const ok = items.filter((i) => i.ok).length;
  const failed = items.length - ok;
  const body = failed === 0 ? `${ok} files ready to download` : `${ok} ready, ${failed} failed`;
  const target = items.find((i) => !i.ok) ?? first;
  show('Batch complete', body, `batch-${first.localId}`, () => focusRow(target.localId));
}
