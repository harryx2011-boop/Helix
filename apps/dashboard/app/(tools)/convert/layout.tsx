import type { ReactNode } from 'react';
import '../../converter.css';

/**
 * The converter carries its own token set (`--p-*`, a blue action colour, its
 * own radii and type scale) rather than the marketing surface's `--m-*` and
 * violet. `data-surface="convert"` is the scope every one of those rules is
 * written against — see app/converter.css — so the design travels intact
 * without leaking into the pages around it.
 */
export default function ConvertLayout({ children }: { children: ReactNode }) {
  return <div data-surface="convert">{children}</div>;
}
