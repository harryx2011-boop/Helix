/**
 * Third-party brand marks used to identify the services the compression
 * presets target. Inline SVG rather than a favicon fetch: these render inside
 * pill buttons that must paint offline (the converter runs entirely in the
 * browser, `/convert` works with no network), and a favicon service asked for
 * `gmail.com` walks up to `google.com` and returns the wrong mark with a 200.
 *
 * Both keep their real brand colours. A third-party logo recoloured to match
 * our palette is no longer that brand's logo, so unlike a Lucide glyph these
 * do NOT take `currentColor`.
 *
 * Gmail and Google are trademarks of Google LLC; Discord is a trademark of
 * Discord Inc. Used to identify the upload limits these presets target; Helix
 * is not affiliated with or endorsed by either.
 */

/** Gmail envelope — the four-colour "M" in the official red-bordered tray. */
export function GmailMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M6 38h6V22.5L3 15.75V35a3 3 0 0 0 3 3Z" />
      <path fill="#34A853" d="M36 38h6a3 3 0 0 0 3-3V15.75L36 22.5V38Z" />
      <path fill="#FBBC05" d="M36 13.5V22.5l9-6.75V15a4.5 4.5 0 0 0-7.2-3.6L36 13.5Z" />
      <path fill="#EA4335" d="M12 22.5v-9l12 9 12-9v9l-12 9-12-9Z" />
      <path fill="#C5221F" d="M3 15v.75l9 6.75v-9l-1.8-1.35A4.5 4.5 0 0 0 3 15Z" />
    </svg>
  );
}

/** Discord clover mark in Blurple. */
export function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" className={className} fill="#5865F2" aria-hidden="true">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}
