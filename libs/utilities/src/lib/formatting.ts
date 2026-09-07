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
