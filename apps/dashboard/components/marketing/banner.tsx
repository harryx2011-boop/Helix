import Link from 'next/link';
import { GITHUB_URL } from '@/lib/github-stars';

/** WEBSITE.md §4.0. Full-width violet bar, pill corners, white text, underlined link. */
export function Banner() {
  return (
    <div className="bg-violet px-4 py-2.5 text-center font-sans text-[13px] font-medium text-white">
      Helix is pre-1.0. Follow the build on{' '}
      <Link href={GITHUB_URL} className="underline decoration-white/48 underline-offset-2 hover:decoration-white">
        GitHub →
      </Link>
    </div>
  );
}
