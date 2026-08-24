import { Cron } from 'croner';

/**
 * Monitor schedules.
 *
 * A schedule is a cron expression with a timezone. Callers may also write a
 * plain interval (`15m`, `6h`, `1d`), which is turned into the equivalent cron
 * so there is one representation in storage and one code path for "when next".
 *
 * The operator sets the minimum interval for their instance. It is enforced by
 * inspecting the next few firings rather than parsing cron fields, so a
 * pattern that is sparse most of the time but dense at one point still counts.
 */

export interface ScheduleInput {
  cron?: string | undefined;
  every?: string | undefined;
  timezone?: string | undefined;
}

export interface Schedule {
  cron: string;
  timezone: string;
  /** How the caller wrote it, kept so the monitor echoes the same shape back. */
  every?: string | undefined;
}

export class ScheduleError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

const EVERY_PATTERN = /^(\d+)\s*(m|min|h|hr|d)$/i;

// `15m` → every 15 minutes; `6h` → on the hour every 6 hours; `1d` → midnight daily.
export function everyToCron(every: string): string {
  const match = EVERY_PATTERN.exec(every.trim());
  if (!match) {
    throw new ScheduleError('Use an interval like `15m`, `6h` or `1d`, or a cron expression.', 'schedule.every');
  }

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();

  if (amount < 1) {
    throw new ScheduleError('The interval must be at least 1.', 'schedule.every');
  }

  if (unit === 'm' || unit === 'min') {
    if (amount >= 60) {
      if (amount % 60 !== 0) {
        throw new ScheduleError('Minute intervals over an hour must divide evenly into hours.', 'schedule.every');
      }
      return everyToCron(`${amount / 60}h`);
    }
    return amount === 1 ? '* * * * *' : `*/${amount} * * * *`;
  }

  if (unit === 'h' || unit === 'hr') {
    if (amount >= 24) {
      if (amount % 24 !== 0) {
        throw new ScheduleError('Hour intervals over a day must divide evenly into days.', 'schedule.every');
      }
      return everyToCron(`${amount / 24}d`);
    }
    return amount === 1 ? '0 * * * *' : `0 */${amount} * * *`;
  }

  return amount === 1 ? '0 0 * * *' : `0 0 */${amount} * *`;
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Accepts the string form (`"0 * * * *"`) or the object form
 * (`{ cron }`, `{ every }`, plus optional `timezone`).
 */
export function normalizeSchedule(input: string | ScheduleInput): Schedule {
  const object: ScheduleInput = typeof input === 'string' ? { cron: input } : input;

  if (object.cron && object.every) {
    throw new ScheduleError('Give either `cron` or `every`, not both.', 'schedule');
  }

  const timezone = object.timezone ?? 'UTC';
  if (!validTimezone(timezone)) {
    throw new ScheduleError(`Unknown timezone \`${timezone}\`.`, 'schedule.timezone');
  }

  let cron: string;
  if (object.every) {
    cron = everyToCron(object.every);
  } else if (object.cron && object.cron.trim().length > 0) {
    cron = object.cron.trim();
  } else {
    throw new ScheduleError('A schedule needs a cron expression or an interval.', 'schedule');
  }

  try {
    new Cron(cron, { timezone, paused: true }).stop();
  } catch (error) {
    throw new ScheduleError(
      `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`,
      object.every ? 'schedule.every' : 'schedule.cron',
    );
  }

  return { cron, timezone, ...(object.every !== undefined ? { every: object.every.trim() } : {}) };
}

export function nextRun(schedule: Schedule, from: Date = new Date()): Date | null {
  const job = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true });
  const next = job.nextRun(from);
  job.stop();
  return next;
}

/**
 * The shortest gap between consecutive firings among the next `sample` runs,
 * in seconds. `null` when the pattern never fires again.
 */
export function minimumGapSeconds(schedule: Schedule, sample = 8, from: Date = new Date()): number | null {
  const job = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true });
  const runs = job.nextRuns(sample, from);
  job.stop();

  if (runs.length < 2) return runs.length === 0 ? null : Number.POSITIVE_INFINITY;

  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < runs.length; i += 1) {
    const gap = (runs[i]!.getTime() - runs[i - 1]!.getTime()) / 1000;
    if (gap < min) min = gap;
  }
  return min;
}

/** Throws when the schedule fires more often than the operator allows. */
export function assertMinimumInterval(schedule: Schedule, minIntervalSeconds: number): void {
  if (minIntervalSeconds <= 0) return;

  const gap = minimumGapSeconds(schedule);
  if (gap === null) {
    throw new ScheduleError('That schedule never fires.', 'schedule');
  }

  if (gap < minIntervalSeconds) {
    const minutes = Math.round(minIntervalSeconds / 60);
    throw new ScheduleError(
      `That schedule fires every ${Math.round(gap / 60)} minutes; this instance allows at most one check every ${minutes} minutes (HELIX_MONITOR_MIN_INTERVAL).`,
      'schedule',
    );
  }
}
