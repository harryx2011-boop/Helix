import { Cron } from 'croner';

/**
 * Monitor schedules.
 *
 * A schedule is a cron expression with a timezone. Callers may also write a
 * plain interval (`15m`, `6h`, `1d`), which is turned into the equivalent cron
 * so there is one representation in storage and one code path for "when next".
 *
 * An optional business-hours `window` narrows the cron further: a day-of-week
 * and hour range in the schedule's own timezone. The cron decides how often a
 * check could run; the window decides which of those firings are allowed. A
 * candidate outside the window is skipped forward to the next one inside it --
 * the window restricts the cron, it never fires on its own and never widens
 * what the cron already produces. A combination that never intersects (e.g. a
 * cron that only fires on Sunday against a Monday-Friday window) is rejected
 * at validation time, the same way an impossible cron is.
 *
 * The operator sets the minimum interval for their instance. It is enforced by
 * inspecting the next few firings rather than parsing cron fields, so a
 * pattern that is sparse most of the time but dense at one point still counts.
 */

export interface ScheduleWindowInput {
  /** 0 = Sunday .. 6 = Saturday. Defaults to Monday-Friday. */
  days?: number[] | undefined;
  /** Hour the window opens, inclusive, 0-23. */
  startHour: number;
  /** Hour the window closes, exclusive, 1-24. */
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
  /** How the caller wrote it, kept so the monitor echoes the same shape back. */
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
/** Candidates checked against the window before giving up and calling it unreachable. */
const WINDOW_SEARCH_LIMIT = 10_000;

// `15m` maps to every 15 minutes; `6h` to on the hour every 6 hours; `1d` to midnight daily.
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

/** Whether `at` falls inside the window, evaluated in the schedule's own timezone. */
export function withinWindow(window: ScheduleWindow, at: Date, timezone: string): boolean {
  const parts = weekdayFormat(timezone).formatToParts(at);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourText = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const day = WEEKDAY_INDEX[weekday];
  // Midnight renders as "24" under hour12: false in some environments.
  const hour = Number.parseInt(hourText, 10) % 24;

  if (day === undefined) return false;
  return window.days.includes(day) && hour >= window.startHour && hour < window.endHour;
}

/**
 * Accepts the string form (`"0 * * * *"`) or the object form
 * (`{ cron }`, `{ every }`, plus optional `timezone` and `window`).
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

/** The next cron firing that also falls inside the schedule's window, if any. */
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

/**
 * The shortest gap between consecutive firings among the next `sample` runs,
 * in seconds. `null` when the pattern never fires again. Firings outside the
 * window are skipped, so the measured gap is the real interval a caller with
 * a window sees, not the raw cron's.
 */
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
