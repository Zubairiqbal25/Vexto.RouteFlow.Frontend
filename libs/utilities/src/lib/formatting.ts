/**
 * Presentation helpers shared by all three apps.
 *
 * Vexto operates in the UAE, so dates are rendered in Gulf Standard Time unless the caller says
 * otherwise. Everything the API returns is UTC (`DateTimeOffset`), and the conversion happens here
 * exactly once rather than in every template.
 */

const TIME_ZONE = 'Asia/Dubai';
const LOCALE = 'en-AE';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** `06 Sep 2026` */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat(LOCALE, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: TIME_ZONE,
      }).format(date)
    : '—';
}

/** `06:15 AM` */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat(LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: TIME_ZONE,
      }).format(date)
    : '—';
}

/** `06 Sep 2026, 06:15 AM` */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);

  return date ? `${formatDate(date)}, ${formatTime(date)}` : '—';
}

/**
 * `just now`, `8 sec ago`, `4 min ago`, `2 hr ago`.
 *
 * Deliberately coarse: passengers are being told whether a bus position is trustworthy, not the
 * exact age of a GPS fix.
 */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));

  if (seconds < 5) {
    return 'just now';
  }

  if (seconds < 60) {
    return `${seconds} sec ago`;
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  }

  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)} hr ago`;
  }

  return formatDate(date);
}

/** Seconds between a timestamp and now, used to decide whether tracking is live or stale. */
export function secondsSince(value: string | Date | null | undefined, now = new Date()): number {
  const date = toDate(value);

  return date ? Math.max(0, (now.getTime() - date.getTime()) / 1000) : Number.POSITIVE_INFINITY;
}

/** Whole days from today until the given date; negative once the date has passed. */
export function daysUntil(value: string | Date | null | undefined, now = new Date()): number {
  const date = toDate(value);

  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

/** `Ahmed Al Mansouri` -> `AM`. Falls back to one letter, then to a dash. */
export function initials(...parts: (string | null | undefined)[]): string {
  const words = parts
    .filter((part): part is string => !!part && part.trim().length > 0)
    .flatMap((part) => part.trim().split(/\s+/u));

  if (words.length === 0) {
    return '—';
  }

  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';

  return `${first}${last}`;
}

/** Turns a PascalCase API enum such as `InProgress` into `In Progress` for display. */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return value.replace(/([a-z0-9])([A-Z])/gu, '$1 $2');
}

/** `+971 50 123 4567` is left alone; digits-only input is grouped for readability. */
export function formatMobile(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const trimmed = value.trim();

  if (trimmed.includes(' ')) {
    return trimmed;
  }

  const match = /^(\+971)(\d{2})(\d{3})(\d{4})$/u.exec(trimmed);

  return match ? `${match[1]} ${match[2]} ${match[3]} ${match[4]}` : trimmed;
}

/**
 * Money, as somebody checking a bill reads it: `AED 420.00`.
 *
 * The currency code rather than a symbol, and always two decimals. An operator may invoice in more
 * than one currency, and `420.00` on its own beside `420.00` in another currency is how somebody
 * pays the wrong amount. A code is unambiguous everywhere; the symbol for a dirham is not.
 *
 * Grouped with the browser's locale so a large figure is readable, but the code is never
 * localised — `AED` is `AED` in every language, and swapping it for a translated name would make
 * an invoice harder to match against a bank statement.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined) {
    // A dash, not a zero. "Nothing is known" and "nothing is owed" are different facts, and a
    // provider fee that has not been reported yet is the first of them.
    return '—';
  }

  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${formatted}` : formatted;
}

/**
 * `Today`, `Tomorrow`, `Yesterday`, otherwise `Mon 14 Sep`.
 *
 * Operational screens ask "when is the next bus", and the honest answer to that is almost never a
 * calendar date: a driver looking at 06:00 needs to know whether that is this morning or the next
 * one. Comparison is done on the Gulf calendar day, not on UTC, because a 20:00 UTC departure is
 * already tomorrow in Dubai and calling it "today" would be wrong by a day for the evening shift.
 */
export function formatDayLabel(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  const day = localDayNumber(date);
  const today = localDayNumber(now);

  if (day === today) {
    return 'Today';
  }

  if (day === today + 1) {
    return 'Tomorrow';
  }

  if (day === today - 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

/** `Tomorrow · 06:00`. The one line a "next trip" card leads with. */
export function formatDayTime(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);

  return date ? `${formatDayLabel(date, now)} · ${formatTime(date)}` : '—';
}

/**
 * Whole minutes from now until a timestamp; negative once it has passed.
 *
 * Used for countdowns ("starts in 22 min"). Callers must still decide whether a countdown is
 * honest — a departure time is a plan, an ETA is a measurement, and only one of them may be
 * presented as where the bus actually is.
 */
export function minutesUntil(value: string | Date | null | undefined, now = new Date()): number {
  const date = toDate(value);

  return date ? Math.round((date.getTime() - now.getTime()) / 60_000) : Number.POSITIVE_INFINITY;
}

/** `1 h 12 m`, `45 min`. For a completed trip's duration, where seconds are noise. */
export function formatDuration(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): string {
  const start = toDate(from);
  const end = toDate(to);

  if (!start || !end) {
    return '—';
  }

  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));

  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

/** The Gulf calendar day a timestamp falls on, as a comparable integer. */
function localDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  return Math.round(Date.parse(`${parts}T00:00:00Z`) / 86_400_000);
}

/**
 * A service date, in the operator's own business day, as `YYYY-MM-DD`.
 *
 * **Not `toISOString().slice(0, 10)`.** That is the UTC date, and Vexto operates in the Gulf, four
 * hours ahead: between midnight and 04:00 local it is still *yesterday* in UTC. Every screen that
 * asked for "today" that way — the dispatcher's dashboard, the driver's trip list, the passenger's
 * next ride — showed the previous day's operation to anybody working the early shift, which is
 * precisely the shift a transport operator runs.
 *
 * `en-CA` is used because its short date format is already `YYYY-MM-DD`, which is what the API's
 * `DateOnly` parameters expect.
 */
export function serviceDate(offsetDays = 0, now = new Date()): string {
  const date = new Date(now.getTime() + offsetDays * 86_400_000);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The weekday name of a business day, matching the day names the schedule API uses.
 *
 * Paired with `serviceDate` deliberately: asking for the weekday in one calendar and the date in
 * another is how a schedule gets added for Wednesday and trips get generated for Tuesday.
 */
export function serviceWeekday(offsetDays = 0, now = new Date()): string {
  const date = new Date(now.getTime() + offsetDays * 86_400_000);

  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'long' }).format(date);
}
