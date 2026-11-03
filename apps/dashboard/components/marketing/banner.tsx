import Link from 'next/link';

/** WEBSITE.md §4.0. Full-width violet bar, pill corners, white text, underlined link. */
export function Banner() {
  return (
    <div className="bg-violet px-4 py-2.5 text-center font-sans text-[13px] font-medium text-white">
      Helix now runs in your browser, on your own PC.{' '}
      <Link href="/download" className="underline decoration-white/48 underline-offset-2 hover:decoration-white">
        Run it locally →
      </Link>
    </div>
  );
}
