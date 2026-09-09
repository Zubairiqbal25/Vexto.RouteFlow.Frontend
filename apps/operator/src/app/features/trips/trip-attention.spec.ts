import type { TripResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { tripAttention } from './trip-attention';

const NOW = new Date('2026-09-08T06:30:00Z');

function trip(overrides: Partial<TripResponse> = {}): TripResponse {
  return {
    id: 't1',
    route: { id: 'r1', code: 'DSO-BB', name: 'DSO → Business Bay' },
    driver: { id: 'd1', name: 'Ahmed Khan' },
    vehicle: { id: 'v1', plateNumber: 'A 12345' },
    serviceDate: '2026-09-08',
    scheduledStartAtUtc: '2026-09-08T07:00:00Z',
    scheduledEndAtUtc: null,
    actualStartAtUtc: null,
    actualEndAtUtc: null,
    status: 'Scheduled',
    passengerCount: 24,
    attendance: { expected: 24, boarded: 0, noShow: 0, skipped: 0, droppedOff: 0 },
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  } as TripResponse;
}

const ids = (input: TripResponse, tracking: 'live' | 'stale' | 'offline' | null = null) =>
  tripAttention(input, tracking, NOW).map((note) => note.id);

describe('tripAttention', () => {
  it('says nothing about a well-formed upcoming trip', () => {
    expect(ids(trip())).toEqual([]);
  });

  it('flags a trip that cannot depart', () => {
    expect(ids(trip({ driver: null }))).toEqual(['no-driver']);
    expect(ids(trip({ vehicle: null }))).toEqual(['no-vehicle']);
  });

  it('leaves a finished trip alone even when its crew was never recorded', () => {
    // A completed journey with no driver on it is a gap in the history, not something anybody can
    // fix this morning — and an attention note about last March is noise every day thereafter.
    expect(ids(trip({ status: 'Completed', driver: null, vehicle: null }))).toEqual([]);
    expect(ids(trip({ status: 'Cancelled', driver: null }))).toEqual([]);
  });

  it('reports a departure time that has passed with nothing recorded', () => {
    const late = trip({ scheduledStartAtUtc: '2026-09-08T06:00:00Z' });

    expect(ids(late)).toEqual(['not-departed']);
    expect(tripAttention(late, null, NOW)[0]?.message).toContain('30 minutes ago');
  });

  it('tolerates a bus that is a few minutes behind', () => {
    // Buses leave slightly late as a matter of routine; a board that complained about every one of
    // them is a board nobody reads.
    expect(ids(trip({ scheduledStartAtUtc: '2026-09-08T06:25:00Z' }))).toEqual([]);
  });

  it('never claims a trip is delayed, only that it has not departed', () => {
    // Vexto records no expected arrival, so "delayed" would be an opinion a dispatcher would ring a
    // driver about.
    const messages = tripAttention(
      trip({ scheduledStartAtUtc: '2026-09-08T05:00:00Z' }),
      null,
      NOW,
    ).map((note) => note.message.toLowerCase());

    expect(messages.some((message) => message.includes('delay'))).toBe(false);
  });

  it('flags a running trip whose bus has stopped reporting', () => {
    expect(ids(trip({ status: 'Started', actualStartAtUtc: '2026-09-08T06:05:00Z' }), 'offline')).toEqual([
      'not-reporting',
    ]);
  });

  it('does not complain about tracking on a trip that has not started', () => {
    expect(ids(trip(), 'offline')).toEqual([]);
  });
});
