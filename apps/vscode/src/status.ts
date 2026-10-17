import type { ApiTarget } from './target';

/** What the status-bar item shows. `warning` picks the warning background. */
export interface StatusView {
  text: string;
  tooltip: string;
  warning: boolean;
}

export function statusView(target: ApiTarget | null, triedPorts: number[]): StatusView {
  if (!target) {
    return {
      text: '$(circle-slash) Helix',
      tooltip: `No Helix API answered on port ${triedPorts.join(' or ')}. Start the Helix desktop app or the dev stack.`,
      warning: true,
    };
  }

  const ok = target.status === 'ok';
  return {
    text: ok ? '$(pulse) Helix' : '$(warning) Helix',
    tooltip: `Helix ${target.version} on port ${target.port}: ${target.status}. Click to open.`,
    warning: !ok,
  };
}
