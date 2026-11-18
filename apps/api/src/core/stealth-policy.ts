// Stealth rungs: robots.txt gate and the one challenge-solver retry (ADR 0006).
import type { Tier } from './escalation.js';
import type { FailureReason } from './block-detection.js';

export interface RobotsSource {
  forUrl(url: string): Promise<{ isAllowed(url: string): boolean }>;
}

export const STEALTH_TIERS: ReadonlySet<Tier> = new Set<Tier>(['browser']);

export function isStealthTier(tier: Tier): boolean {
  return STEALTH_TIERS.has(tier);
}

export class StealthRobots {
  #source: RobotsSource | undefined;

  configure(source: RobotsSource | undefined): void {
    this.#source = source;
  }

  async allows(url: string): Promise<boolean> {
    if (!this.#source) return true;
    const rules = await this.#source.forUrl(url);
    return rules.isAllowed(url);
  }
}

export const stealthRobots = new StealthRobots();

export function wantsChallengeRetry(input: {
  solveCloudflare: boolean | undefined;
  reason: FailureReason | undefined;
}): boolean {
  return input.reason === 'challenge' && input.solveCloudflare !== true;
}

export const ROBOTS_DENIED_DETAIL =
  'robots.txt disallows this URL; the browser rung follows robots.txt (the plain and tls tiers do not)';
