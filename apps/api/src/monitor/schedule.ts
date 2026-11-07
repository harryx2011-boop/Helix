import { Cron } from 'croner';


export interface ScheduleWindowInput {
  days?: number[] | undefined;
  startHour: number;
  endHour: number;
}

export interface ScheduleWindow {
  days: number[];
  startHour: number;
  endHour: number;
}

export interface ScheduleInput {
  cron?: string | undefined;
  every?: string | undefined;
  timezone?: string | undefined;
  window?: ScheduleWindowInput | undefined;
}

export interface Schedule {
  cron: string;
  timezone: string;
  every?: string | undefined;
  window?: ScheduleWindow | undefined;
}

export class ScheduleError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

const EVERY_PATTERN = /^(\d+)\s*(m|min|h|hr|d)$/i;
const DEFAULT_WINDOW_DAYS = [1, 2, 3, 4, 5];
const WINDOW_SEARCH_LIMIT = 10_000;

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
    if (60 % amount !== 0) {
      throw new ScheduleError(
        'A minute interval must divide evenly into 60, or it will not fire at a steady gap; use a cron expression instead.',
        'schedule.every',
      );
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
    if (24 % amount !== 0) {
      throw new ScheduleError(
        'An hour interval must divide evenly into 24, or it will not fire at a steady gap; use a cron expression instead.',
        'schedule.every',
      );
    }
    return amount === 1 ? '0 * * * *' : `0 */${amount} * * *`;
  }

  if (amount > 1) {
    throw new ScheduleError(
      'A day interval greater than 1 does not repeat at a steady gap across month boundaries; use a cron expression instead.',
      'schedule.every',
    );
  }
  return '0 0 * * *';
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalizeWindow(input: ScheduleWindowInput): ScheduleWindow {
  const days = input.days ?? DEFAULT_WINDOW_DAYS;
  if (days.length === 0) {
    throw new ScheduleError('schedule.window.days must name at least one day.', 'schedule.window.days');
  }
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new ScheduleError('schedule.window.days must be integers 0 (Sunday) to 6 (Saturday).', 'schedule.window.days');
    }
  }

  const { startHour, endHour } = input;
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new ScheduleError('schedule.window.startHour must be an integer 0-23.', 'schedule.window.startHour');
  }
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    throw new ScheduleError('schedule.window.endHour must be an integer 1-24.', 'schedule.window.endHour');
  }
  if (endHour <= startHour) {
    throw new ScheduleError('schedule.window.endHour must be after startHour.', 'schedule.window.endHour');
  }

  return { days: [...days].sort((a, b) => a - b), startHour, endHour };
}

const WEEKDAY_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function weekdayFormat(timezone: string): Intl.DateTimeFormat {
  let format = WEEKDAY_FORMAT_CACHE.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: 'numeric', hour12: false });
    WEEKDAY_FORMAT_CACHE.set(timezone, format);
  }
  return format;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function withinWindow(window: ScheduleWindow, at: Date, timezone: string): boolean {
  const parts = weekdayFormat(timezone).formatToParts(at);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourText = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const day = WEEKDAY_INDEX[weekday];
  const hour = Number.parseInt(hourText, 10) % 24;

  if (day === undefined) return false;
  return window.days.includes(day) && hour >= window.startHour && hour < window.endHour;
}

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

  const window = object.window ? normalizeWindow(object.window) : undefined;

  const schedule: Schedule = {
    cron,
    timezone,
    ...(object.every !== undefined ? { every: object.every.trim() } : {}),
    ...(window ? { window } : {}),
  };

  if (window && nextRun(schedule) === null) {
    throw new ScheduleError(
      'That schedule never fires inside the business-hours window given.',
      'schedule.window',
    );
  }

  return schedule;
}

export function nextRun(schedule: Schedule, from: Date = new Date()): Date | null {
  const job = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true });
  if (!schedule.window) {
    const next = job.nextRun(from);
    job.stop();
    return next;
  }

  let candidate = from;
  for (let i = 0; i < WINDOW_SEARCH_LIMIT; i += 1) {
    const next = job.nextRun(candidate);
    if (!next) {
      job.stop();
      return null;
    }
    if (withinWindow(schedule.window, next, schedule.timezone)) {
      job.stop();
      return next;
    }
    candidate = next;
  }
  job.stop();
  return null;
}

export function minimumGapSeconds(schedule: Schedule, sample = 8, from: Date = new Date()): number | null {
  const runs: Date[] = [];
  let cursor = from;
  for (let i = 0; i < sample; i += 1) {
    const next = nextRun(schedule, cursor);
    if (!next) break;
    runs.push(next);
    cursor = next;
  }

  if (runs.length < 2) return runs.length === 0 ? null : Number.POSITIVE_INFINITY;

  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < runs.length; i += 1) {
    const gap = (runs[i]!.getTime() - runs[i - 1]!.getTime()) / 1000;
    if (gap < min) min = gap;
  }
  return min;
}

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
