/** Per-endpoint usage shapes the health page reads. */

export type UsageStatusClass = '2xx' | '4xx' | '429' | '5xx';
export type UsageStatusCounts = Record<UsageStatusClass, number>;

export interface UsageEndpointDay {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  counts: UsageStatusCounts;
  /** Hours in the day with at least one recorded request. */
  observedHours: number;
  /** Observed hours in which at least one request answered 5xx. */
  badHours: number;
}

/** Recorded outcomes for one route family (`/scrape`, `/crawl/:id`, ...), as the health page reads them. */
export interface UsageEndpoint {
  endpoint: string;
  requests: number;
  counts: UsageStatusCounts;
  /** 2xx and 5xx in the hourly buckets that start within the last 24 hours. */
  last24h: { ok: number; failed: number };
  days: UsageEndpointDay[];
}
