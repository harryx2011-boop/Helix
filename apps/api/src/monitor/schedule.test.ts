import { Cron } from 'croner';
import { describe, expect, it } from 'vitest';
import {
  assertMinimumInterval,
  everyToCron,
  minimumGapSeconds,
  nextRun,
  normalizeSchedule,
  ScheduleError,
  withinWindow,
} from './schedule.js';

describe('everyToCron', () => {
  it('turns intervals into cron expressions', () => {
    expect(everyToCron('15m')).toBe('*/15 * * * *');
    expect(everyToCron('1m')).toBe('* * * * *');
    expect(everyToCron('6h')).toBe('0 */6 * * *');
    expect(everyToCron('1h')).toBe('0 * * * *');
    expect(everyToCron('1d')).toBe('0 0 * * *');
    expect(everyToCron('120m')).toBe('0 */2 * * *');
  });

  it('rejects intervals that do not map onto a cron grid', () => {
    expect(() => everyToCron('90m')).toThrow(ScheduleError);
    expect(() => everyToCron('36h')).toThrow(ScheduleError);
    expect(() => everyToCron('soon')).toThrow(ScheduleError);
    expect(() => everyToCron('0h')).toThrow(ScheduleError);
  });

  // A 45-minute cron fires at :00 and :45, a 15-minute gap, not 45. Any
  // minute amount that does not divide 60 has the same problem, and the
  // equivalent is true for hours over a day and any multi-day interval: a
  // day-of-month step restarts the count at 1 every month, so a 10-day
  // schedule fires on day 21, day 31 (or the 1st), day 11 -- never a steady
  // 10 days apart.
  it('rejects minute amounts that do not divide 60', () => {
    expect(() => everyToCron('45m')).toThrow(ScheduleError);
    expect(() => everyToCron('45m')).toThrow(/cron expression/);
  });

  it('rejects hour amounts that do not divide 24', () => {
    expect(() => everyToCron('5h')).toThrow(ScheduleError);
  });

  it('rejects any day amount greater than 1', () => {
    expect(() => everyToCron('7d')).toThrow(ScheduleError);
    expect(() => everyToCron('10d')).toThrow(ScheduleError);
    expect(() => everyToCron('16d')).toThrow(ScheduleError);
  });

  it('accepts amounts that divide evenly and produces an equally spaced schedule', () => {
    expect(everyToCron('15m')).toBe('*/15 * * * *');
    expect(everyToCron('30m')).toBe('*/30 * * * *');
    expect(everyToCron('1h')).toBe('0 * * * *');
    expect(everyToCron('6h')).toBe('0 */6 * * *');
    expect(everyToCron('1d')).toBe('0 0 * * *');
  });

  it('produces a cron expression whose first several runs are equally spaced', () => {
    for (const every of ['15m', '30m', '1h', '6h', '1d']) {
      const cron = everyToCron(every);
      const job = new Cron(cron, { timezone: 'UTC', paused: true });
      const runs: Date[] = [];
      let cursor: Date | undefined = new Date('2026-01-01T00:00:00Z');
      for (let i = 0; i < 6; i += 1) {
        const next = job.nextRun(cursor);
        if (!next) break;
        runs.push(next);
        cursor = next;
      }
      job.stop();

      expect(runs.length).toBe(6);
      const gaps = new Set<number>();
      for (let i = 1; i < runs.length; i += 1) {
        gaps.add(runs[i]!.getTime() - runs[i - 1]!.getTime());
      }
      expect(gaps.size, `${every} -> ${cron} produced uneven gaps`).toBe(1);
    }
  });
});

describe('normalizeSchedule', () => {
  it('accepts a bare cron string', () => {
    expect(normalizeSchedule('0 * * * *')).toEqual({ cron: '0 * * * *', timezone: 'UTC' });
  });

  it('accepts the object form with a timezone', () => {
    expect(normalizeSchedule({ every: '6h', timezone: 'Europe/London' })).toEqual({
      cron: '0 */6 * * *',
      timezone: 'Europe/London',
      every: '6h',
    });
  });

  it('rejects an invalid cron expression with the field named', () => {
    expect(() => normalizeSchedule('every hour')).toThrow(ScheduleError);
    try {
      normalizeSchedule({ cron: '99 * * * *' });
    } catch (error) {
      expect((error as ScheduleError).field).toBe('schedule.cron');
    }
  });

  it('rejects unknown timezones and ambiguous input', () => {
    expect(() => normalizeSchedule({ cron: '0 * * * *', timezone: 'Mars/Olympus' })).toThrow(/timezone/);
    expect(() => normalizeSchedule({ cron: '0 * * * *', every: '1h' })).toThrow(/either/);
    expect(() => normalizeSchedule({})).toThrow(ScheduleError);
  });
});

describe('nextRun', () => {
  it('computes the next firing after a given instant in the schedule timezone', () => {
    const from = new Date('2026-08-24T12:30:00Z');
    expect(nextRun({ cron: '0 * * * *', timezone: 'UTC' }, from)?.toISOString()).toBe('2026-08-24T13:00:00.000Z');
    // 9am London in August is 08:00 UTC.
    expect(nextRun({ cron: '0 9 * * *', timezone: 'Europe/London' }, from)?.toISOString()).toBe(
      '2026-08-25T08:00:00.000Z',
    );
  });
});

describe('minimum interval', () => {
  it('measures the shortest gap between firings', () => {
    expect(minimumGapSeconds({ cron: '*/15 * * * *', timezone: 'UTC' })).toBe(900);
    expect(minimumGapSeconds({ cron: '0 * * * *', timezone: 'UTC' })).toBe(3600);
  });

  it('catches a pattern that is sparse except at one point', () => {
    // Hourly, plus an extra firing one minute past nine.
    const gap = minimumGapSeconds({ cron: '0,1 9 * * *', timezone: 'UTC' }, 8, new Date('2026-08-24T00:00:00Z'));
    expect(gap).toBe(60);
  });

  it('enforces the operator minimum and names the env var', () => {
    expect(() => assertMinimumInterval({ cron: '*/15 * * * *', timezone: 'UTC' }, 3600)).toThrow(
      /HELIX_MONITOR_MIN_INTERVAL/,
    );
    expect(() => assertMinimumInterval({ cron: '0 * * * *', timezone: 'UTC' }, 3600)).not.toThrow();
    expect(() => assertMinimumInterval({ cron: '*/15 * * * *', timezone: 'UTC' }, 0)).not.toThrow();
  });
});

describe('business-hours window', () => {
  it('skips a firing outside the window to the next one inside it', () => {
    // Hourly cron, Mon-Fri 9-17 UTC. From a Friday evening, the next in-window
    // firing is Monday morning, not Friday 18:00.
    const schedule = normalizeSchedule({
      cron: '0 * * * *',
      timezone: 'UTC',
      window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    });
    const friday1830 = new Date('2026-08-28T18:30:00Z');
    expect(nextRun(schedule, friday1830)?.toISOString()).toBe('2026-08-31T09:00:00.000Z');
  });

  it('stays on an in-window firing without skipping ahead', () => {
    const schedule = normalizeSchedule({
      cron: '0 * * * *',
      timezone: 'UTC',
      window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    });
    const tuesday1000 = new Date('2026-08-25T10:00:00Z');
    expect(nextRun(schedule, tuesday1000)?.toISOString()).toBe('2026-08-25T11:00:00.000Z');
  });

  it('measures the real gap a window imposes, not the raw cron interval', () => {
    const schedule = normalizeSchedule({
      cron: '0 * * * *',
      timezone: 'UTC',
      window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    });
    // The window is open 8 hours a day, so the largest gap (Friday 16:00 to
    // Monday 09:00) dwarfs the 1-hour cron interval elsewhere in the sample.
    const from = new Date('2026-08-24T00:00:00Z');
    expect(minimumGapSeconds(schedule, 8, from)).toBe(3600);
  });

  it('defaults days to Monday-Friday when omitted', () => {
    const schedule = normalizeSchedule({ cron: '0 12 * * *', timezone: 'UTC', window: { startHour: 9, endHour: 17 } });
    expect(withinWindow(schedule.window!, new Date('2026-08-22T12:00:00Z'), 'UTC')).toBe(false); // Saturday
    expect(withinWindow(schedule.window!, new Date('2026-08-24T12:00:00Z'), 'UTC')).toBe(true); // Monday
  });

  it('rejects a window and cron combination that never intersects', () => {
    expect(() =>
      normalizeSchedule({ cron: '0 12 * * 0', timezone: 'UTC', window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } }),
    ).toThrow(/never fires/);
  });

  it('rejects a malformed window', () => {
    expect(() => normalizeSchedule({ cron: '0 * * * *', window: { startHour: 17, endHour: 9 } })).toThrow(ScheduleError);
    expect(() => normalizeSchedule({ cron: '0 * * * *', window: { startHour: 9, endHour: 17, days: [7] } })).toThrow(
      ScheduleError,
    );
  });

  it('evaluates the window in the schedule timezone, not UTC', () => {
    const schedule = normalizeSchedule({
      cron: '0 * * * *',
      timezone: 'Europe/London',
      window: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    });
    // 08:30 UTC is 09:30 London in August (BST), inside the window.
    expect(withinWindow(schedule.window!, new Date('2026-08-24T08:30:00Z'), 'Europe/London')).toBe(true);
  });
});

