import { describe, expect, it } from 'vitest';
import { bucketHistory } from '../routes/status.js';

const NOW = new Date('2026-09-03T12:00:00Z');

describe('bucketHistory', () => {
  it('emits one bucket per day, ascending, even when no rows exist', () => {
    const result = bucketHistory([], 3, NOW);
    expect(result).toEqual([]);
  });

  it('fills every requested day for a service, including days with no samples', () => {
    const rows = [
      { service: 'api', day: '2026-09-03', ok_count: '10', total_count: '10', p50_ms: '12.4' },
      { service: 'api', day: '2026-09-01', ok_count: '5', total_count: '10', p50_ms: '20' },
    ];

    const result = bucketHistory(rows, 3, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.service).toBe('api');
    expect(result[0]?.days.map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(result[0]?.days[0]).toEqual({ day: '2026-09-01', okPct: 50, p50Ms: 20, samples: 10 });
    expect(result[0]?.days[1]).toEqual({ day: '2026-09-02', okPct: null, p50Ms: null, samples: 0 });
    expect(result[0]?.days[2]).toEqual({ day: '2026-09-03', okPct: 100, p50Ms: 12, samples: 10 });
  });

  it('sorts services alphabetically and keeps their buckets independent', () => {
    const rows = [
      { service: 'postgres', day: '2026-09-03', ok_count: '10', total_count: '10', p50_ms: '1' },
      { service: 'browser', day: '2026-09-03', ok_count: '0', total_count: '2', p50_ms: null },
    ];

    const result = bucketHistory(rows, 1, NOW);
    expect(result.map((s) => s.service)).toEqual(['browser', 'postgres']);
    expect(result[0]?.days[0]).toEqual({ day: '2026-09-03', okPct: 0, p50Ms: null, samples: 2 });
  });
});
