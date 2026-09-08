import type { TripResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { groupTrips } from './trip-board';

/** Local calendar date, matching the service date the API sends. */
function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

let sequence = 0;

function trip(overrides: Partial<TripResponse> & { serviceDate: string }): TripResponse {
  sequence += 1;

  return {
    id: `t${sequence}`,
    route: { id: 'r1', code: 'DSO-BB', name: 'DSO → Business Bay' },
    driver: null,
    vehicle: null,
    scheduledStartAtUtc: `${overrides.serviceDate}T06:00:00Z`,
    scheduledEndAtUtc: null,
    actualStartAtUtc: null,
    actualEndAtUtc: null,
    status: 'Scheduled',
    passengerCount: 10,
    attendance: { expected: 10, boarded: 0, noShow: 0, skipped: 0, droppedOff: 0 },
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  } as TripResponse;
}

describe('groupTrips', () => {
  it('bands trips into today, tomorrow, upcoming and earlier', () => {
    const groups = groupTrips([
      trip({ serviceDate: localDate(5) }),
      trip({ serviceDate: localDate() }),
      trip({ serviceDate: localDate(-3) }),
      trip({ serviceDate: localDate(1) }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['today', 'tomorrow', 'upcoming', 'earlier']);
  });

  it('drops empty bands rather than showing a heading over nothing', () => {
    const groups = groupTrips([trip({ serviceDate: localDate() })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('today');
  });

  it('returns nothing at all for an empty board', () => {
    expect(groupTrips([])).toEqual([]);
  });

  it('sorts today by urgency, so a running trip beats an earlier scheduled one', () => {
    const today = localDate();

    const groups = groupTrips([
      trip({ serviceDate: today, status: 'Scheduled', scheduledStartAtUtc: `${today}T05:00:00Z` }),
      trip({ serviceDate: today, status: 'Started', scheduledStartAtUtc: `${today}T09:00:00Z` }),
      trip({ serviceDate: today, status: 'Completed', scheduledStartAtUtc: `${today}T04:00:00Z` }),
    ]);

    expect(groups[0]!.trips.map((item) => item.status)).toEqual([
      'Started',
      'Scheduled',
      'Completed',
    ]);
  });

  it('sinks a cancelled trip below a completed one', () => {
    const today = localDate();

    const groups = groupTrips([
      trip({ serviceDate: today, status: 'Cancelled' }),
      trip({ serviceDate: today, status: 'Completed' }),
    ]);

    expect(groups[0]!.trips.map((item) => item.status)).toEqual(['Completed', 'Cancelled']);
  });

  it('orders within one status by departure time, so a band still reads as a timetable', () => {
    const today = localDate();

    const groups = groupTrips([
      trip({ serviceDate: today, status: 'Scheduled', scheduledStartAtUtc: `${today}T18:00:00Z` }),
      trip({ serviceDate: today, status: 'Scheduled', scheduledStartAtUtc: `${today}T06:00:00Z` }),
    ]);

    expect(groups[0]!.trips.map((item) => item.scheduledStartAtUtc)).toEqual([
      `${today}T06:00:00Z`,
      `${today}T18:00:00Z`,
    ]);
  });

  it('sorts tomorrow by time only — a plan is a schedule, not a priority queue', () => {
    const tomorrow = localDate(1);

    const groups = groupTrips([
      trip({
        serviceDate: tomorrow,
        status: 'Ready',
        scheduledStartAtUtc: `${tomorrow}T18:00:00Z`,
      }),
      trip({
        serviceDate: tomorrow,
        status: 'Scheduled',
        scheduledStartAtUtc: `${tomorrow}T06:00:00Z`,
      }),
    ]);

    // Scheduled outranks Ready by time here, which it would not if urgency were applied.
    expect(groups[0]!.trips.map((item) => item.status)).toEqual(['Scheduled', 'Ready']);
  });

  it('puts the most recent day first among earlier trips', () => {
    const groups = groupTrips([
      trip({ serviceDate: localDate(-10) }),
      trip({ serviceDate: localDate(-1) }),
    ]);

    // Yesterday's attendance is looked at far more often than last month's.
    expect(groups[0]!.trips[0]!.serviceDate).toBe(localDate(-1));
  });
});
