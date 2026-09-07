import 'server-only';

/**
 * Per-million-token USD rates. Cache writes are priced by TTL: a 5-minute
 * ephemeral write is 1.25x fresh input, a 1-hour write is 2x. Reads are 0.1x
 * on every family except Fable 5.1, whose read rate is a quarter of that.
 */
export interface Rates {
  fresh: number;
  create5m: number;
  create1h: number;
  read: number;
  output: number;
}

interface RateEntry {
  rates: Rates;
  /** Time-boxed pricing windows, checked before `rates`. Half-open: from <= t < until. */
  overrides?: { from: string; until: string; rates: Rates }[];
}

function tier(fresh: number, output: number, read = fresh * 0.1): Rates {
  return { fresh, create5m: fresh * 1.25, create1h: fresh * 2, read, output };
}

const RATES: Record<string, RateEntry> = {
  'claude-fable-5-1': { rates: tier(10, 50, 0.25) },
  'claude-mythos-5-1': { rates: tier(10, 50, 0.25) },
  'claude-fable-5': { rates: tier(10, 50, 1) },
  'claude-mythos-5': { rates: tier(10, 50, 1) },
  'claude-opus-5': { rates: tier(5, 25) },
  'claude-opus-4-8': { rates: tier(5, 25) },
  'claude-opus-4-7': { rates: tier(5, 25) },
  'claude-opus-4-6': { rates: tier(5, 25) },
  'claude-sonnet-5': { rates: tier(2, 10) },
  'claude-sonnet-4-6': { rates: tier(3, 15) },
  'claude-haiku-4-5': { rates: tier(1, 5) },
};

/** Bare family words appear in transcripts when a subagent was dispatched with `model: sonnet`. */
const ALIASES: Record<string, string> = {
  fable: 'claude-fable-5-1',
  mythos: 'claude-mythos-5-1',
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
};

const FAMILY_FALLBACK: [RegExp, string][] = [
  [/fable/, 'claude-fable-5-1'],
  [/mythos/, 'claude-mythos-5-1'],
  [/opus/, 'claude-opus-5'],
  [/sonnet/, 'claude-sonnet-5'],
  [/haiku/, 'claude-haiku-4-5'],
];

export interface ResolvedRates {
  rates: Rates;
  /** True when the model id was unknown and its family's rates were substituted. */
  estimated: boolean;
}

export function resolveRates(model: string, at: Date): ResolvedRates | null {
  const key = ALIASES[model] ?? model.replace(/-\d{8}$/, '');
  const entry = RATES[key];
  if (entry) return { rates: pick(entry, at), estimated: false };

  const family = FAMILY_FALLBACK.find(([re]) => re.test(model));
  const fallback = family ? RATES[family[1]] : undefined;
  if (!fallback) return null;
  return { rates: pick(fallback, at), estimated: true };
}

function pick(entry: RateEntry, at: Date): Rates {
  const t = at.getTime();
  const hit = entry.overrides?.find((o) => t >= Date.parse(o.from) && t < Date.parse(o.until));
  return hit?.rates ?? entry.rates;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}

export function costOf(usage: Usage, rates: Rates): number {
  return (
    (usage.input * rates.fresh +
      usage.output * rates.output +
      usage.cacheRead * rates.read +
      usage.cacheCreate5m * rates.create5m +
      usage.cacheCreate1h * rates.create1h) /
    1_000_000
  );
}
