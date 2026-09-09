import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatDayLabel,
  formatDuration,
  formatMobile,
  formatRelative,
  humanizeEnum,
  initials,
  secondsSince,
  serviceDate,
  serviceWeekday,
} from './formatting';

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Ahmed', 'Al Mansouri')).toBe('AM');
  });

  it('falls back to one letter for a single name', () => {
    expect(initials('Zubair')).toBe('Z');
  });

  it('renders a dash rather than an empty circle when there is no name', () => {
    expect(initials(null, undefined)).toBe('—');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-09-06T08:00:00Z');

  it('reads as "just now" inside the noise window', () => {
    expect(formatRelative('2026-09-06T07:59:58Z', now)).toBe('just now');
  });

  it('counts seconds under a minute', () => {
    expect(formatRelative('2026-09-06T07:59:52Z', now)).toBe('8 sec ago');
  });

  it('counts minutes under an hour', () => {
    expect(formatRelative('2026-09-06T07:46:00Z', now)).toBe('14 min ago');
  });

  it('degrades to a date beyond a day', () => {
    expect(formatRelative('2026-09-01T08:00:00Z', now)).toBe('01 Sep 2026');
  });
});

describe('secondsSince', () => {
  it('is infinite for a missing timestamp, so callers treat it as stale', () => {
    expect(secondsSince(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it('never returns a negative age for a clock slightly ahead', () => {
    const now = new Date('2026-09-06T08:00:00Z');
    expect(secondsSince('2026-09-06T08:00:30Z', now)).toBe(0);
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-09-06T23:30:00Z');

  it('is negative once the date has passed', () => {
    expect(daysUntil('2026-09-01', now)).toBe(-5);
  });

  it('compares whole days, not elapsed hours', () => {
    // Half an hour apart, but a different calendar day: a licence expiring tomorrow is 1, not 0.
    expect(daysUntil('2026-09-07', now)).toBe(1);
  });
});

describe('humanizeEnum', () => {
  it('splits PascalCase into words', () => {
    expect(humanizeEnum('PickupAndDropOff')).toBe('Pickup And Drop Off');
  });
});

describe('formatMobile', () => {
  it('groups a bare UAE number', () => {
    expect(formatMobile('+971501234567')).toBe('+971 50 123 4567');
  });

  it('leaves an already-formatted number alone', () => {
    expect(formatMobile('+971 50 123 4567')).toBe('+971 50 123 4567');
  });
});

describe('serviceDate', () => {
  it('is the Gulf business day, not the UTC one', () => {
    // 21:00 UTC is already the next morning in Dubai. A dispatcher opening the app at 01:00 local
    // asked for trips on the previous day before this existed, and was shown an empty board.
    const lateEvening = new Date('2026-09-08T21:00:00Z');

    expect(serviceDate(0, lateEvening)).toBe('2026-09-09');
  });

  it('agrees with the UTC date during the working day', () => {
    expect(serviceDate(0, new Date('2026-09-08T09:00:00Z'))).toBe('2026-09-08');
  });

  it('offsets by whole business days', () => {
    expect(serviceDate(1, new Date('2026-09-08T09:00:00Z'))).toBe('2026-09-09');
    expect(serviceDate(-1, new Date('2026-09-08T09:00:00Z'))).toBe('2026-09-07');
  });
});

describe('serviceWeekday', () => {
  it('names the same day serviceDate returns', () => {
    // The pair has to agree. Read from different calendars, a schedule gets added for Wednesday
    // and trips get generated for Tuesday — which produces nothing, and says nothing about why.
    const lateEvening = new Date('2026-09-08T21:00:00Z');

    expect(serviceDate(0, lateEvening)).toBe('2026-09-09');
    expect(serviceWeekday(0, lateEvening)).toBe('Wednesday');
  });
});

describe('formatDayLabel', () => {
  const now = new Date('2026-09-08T09:00:00Z');

  it('says Today and Tomorrow rather than a date', () => {
    expect(formatDayLabel('2026-09-08T10:00:00Z', now)).toBe('Today');
    expect(formatDayLabel('2026-09-09T10:00:00Z', now)).toBe('Tomorrow');
  });

  it('compares on the Gulf calendar day', () => {
    // 20:30 UTC on the 8th is 00:30 on the 9th in Dubai, so it is tomorrow — not today.
    expect(formatDayLabel('2026-09-08T20:30:00Z', now)).toBe('Tomorrow');
  });

  it('falls back to a dated weekday further out', () => {
    expect(formatDayLabel('2026-09-14T10:00:00Z', now)).toContain('Sep');
  });
});

describe('formatDuration', () => {
  it('reads as minutes under an hour', () => {
    expect(formatDuration('2026-09-08T06:00:00Z', '2026-09-08T06:45:00Z')).toBe('45 min');
  });

  it('reads as hours and minutes beyond one', () => {
    expect(formatDuration('2026-09-08T06:00:00Z', '2026-09-08T07:12:00Z')).toBe('1 h 12 m');
  });

  it('is a dash when the trip never started', () => {
    expect(formatDuration(null, '2026-09-08T07:00:00Z')).toBe('—');
  });
});
