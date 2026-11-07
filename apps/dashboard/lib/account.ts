
export type UsageStatusClass = '2xx' | '4xx' | '429' | '5xx';
export type UsageStatusCounts = Record<UsageStatusClass, number>;

export interface UsageEndpointDay {
  day: string;
  counts: UsageStatusCounts;
  observedHours: number;
  badHours: number;
}

export interface UsageEndpoint {
  endpoint: string;
  requests: number;
  counts: UsageStatusCounts;
  last24h: { ok: number; failed: number };
  days: UsageEndpointDay[];
}
