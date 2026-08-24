import Link from 'next/link';

/** WEBSITE.md §4.0. Full-width violet bar, pill corners, white text, underlined link. */
export function Banner() {
  return (
    <div className="bg-violet px-4 py-2.5 text-center font-sans text-[13px] font-medium text-white">
      Helix is pre-1.0. Follow the build on{' '}
      <Link href="https://github.com/helix-dev/helix" className="underline decoration-white/48 underline-offset-2 hover:decoration-white">
        GitHub →
      </Link>
    </div>
  );
}
