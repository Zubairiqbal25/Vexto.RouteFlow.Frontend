import { TestBed } from '@angular/core/testing';
import type { TripResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { TripCard } from './trip-card';

function trip(overrides: Partial<TripResponse> = {}): TripResponse {
  return {
    id: 't1',
    route: { id: 'r1', code: 'DSO-BB', name: 'DSO → Business Bay' },
    driver: { id: 'd1', name: 'Ahmed Khan' },
    vehicle: { id: 'v1', plateNumber: 'A 12345' },
    serviceDate: '2026-09-08',
    scheduledStartAtUtc: '2026-09-08T06:00:00Z',
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

function render(input: TripResponse, tracking: 'live' | 'stale' | 'offline' | null = null) {
  const fixture = TestBed.createComponent(TripCard);

  fixture.componentRef.setInput('trip', input);
  fixture.componentRef.setInput('tracking', tracking);
  fixture.detectChanges();

  return fixture;
}

function text(input: TripResponse, tracking: 'live' | 'stale' | 'offline' | null = null): string {
  return render(input, tracking).nativeElement.textContent as string;
}

describe('TripCard', () => {
  it('leads with the route, the crew and the bus', () => {
    const rendered = text(trip());

    expect(rendered).toContain('DSO → Business Bay');
    expect(rendered).toContain('Ahmed Khan');
    expect(rendered).toContain('A 12345');
  });

  it('shows a booked count rather than a progress bar before the trip runs', () => {
    const rendered = text(trip());

    expect(rendered).toContain('24 passengers booked');
    expect(rendered).not.toContain('boarded');
  });

  it('shows attendance progress once the trip has started', () => {
    const rendered = text(
      trip({
        status: 'Started',
        attendance: { expected: 15, boarded: 8, noShow: 1, skipped: 0, droppedOff: 0 },
      }),
    );

    expect(rendered).toContain('8 / 24 boarded');
    expect(rendered).toContain('15 still awaited');
  });

  it('counts dropped-off passengers as boarded — they got on the bus', () => {
    const rendered = text(
      trip({
        status: 'Completed',
        attendance: { expected: 0, boarded: 4, noShow: 0, skipped: 0, droppedOff: 20 },
      }),
    );

    expect(rendered).toContain('24 / 24 boarded');
    expect(rendered).toContain('Everyone accounted for');
  });

  it('names the tracking state in words, not only in colour', () => {
    expect(text(trip({ status: 'Started' }), 'live')).toContain('Tracking live');
    expect(text(trip({ status: 'Started' }), 'stale')).toContain('Tracking stale');
    expect(text(trip({ status: 'Started' }), 'offline')).toContain('Not reporting');
  });

  it('shows no tracking line at all for a trip that is not running', () => {
    // A scheduled trip has no bus reporting yet, and a badge saying so would be noise on every
    // card of a board that is mostly scheduled.
    expect(text(trip({ status: 'Scheduled' }), null)).not.toContain('Tracking');
  });

  it('prints the clock once, not the meridiem twice', () => {
    const rendered = text(trip());
    const meridiems = rendered.match(/AM/gu) ?? [];

    // The chip sets the clock large and the suffix small; printing the whole formatted time in the
    // large half rendered "06:00 AM" above a second "AM".
    expect(meridiems.length).toBeLessThanOrEqual(1);
  });

  it('states each outcome in the legend, so the bar is never the only signal', () => {
    const rendered = text(
      trip({
        status: 'Started',
        attendance: { expected: 10, boarded: 8, noShow: 2, skipped: 4, droppedOff: 0 },
      }),
    );

    expect(rendered).toContain('no-show');
    expect(rendered).toContain('absent');
  });

  it('offers only a look at a completed trip', () => {
    const actions = (
      render(trip({ status: 'Completed' })).componentInstance as unknown as {
        actions: () => { id: string }[];
      }
    ).actions();

    // Attendance is closed, and Cancel on a journey that already ran can only produce an error.
    expect(actions.map((action) => action.id)).toEqual(['open']);
  });

  it('offers crew changes and cancellation while a trip can still be affected', () => {
    const actions = (
      render(trip({ status: 'Started' })).componentInstance as unknown as {
        actions: () => { id: string }[];
      }
    ).actions();

    expect(actions.map((action) => action.id)).toContain('cancel');
    expect(actions.map((action) => action.id)).toContain('crew');
  });

  it('says Unassigned rather than leaving crew blank', () => {
    const rendered = text(trip({ driver: null, vehicle: null }));

    expect(rendered).toContain('Unassigned');
  });
});
