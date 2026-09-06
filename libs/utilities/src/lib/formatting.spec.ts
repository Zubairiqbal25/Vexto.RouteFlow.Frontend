import { describe, expect, it } from 'vitest';
import { daysUntil, formatMobile, formatRelative, humanizeEnum, initials, secondsSince } from './formatting';

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
