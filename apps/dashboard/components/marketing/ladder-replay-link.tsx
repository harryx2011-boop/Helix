'use client';

import { PillButton } from './pill-button';

/**
 * Hero secondary CTA: scrolls to the hero panel's ladder explainer and
 * triggers a replay via a window event the hero panel listens for.
 */
export function LadderReplayLink() {
  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    document.getElementById('ladder')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.dispatchEvent(new Event('helix:play-ladder'));
  }

  return (
    <PillButton variant="secondary" onClick={handleClick}>
      See how the ladder works
    </PillButton>
  );
}
