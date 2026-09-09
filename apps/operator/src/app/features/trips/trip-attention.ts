import type { TripResponse } from '@vexto/models';
import { minutesUntil } from '@vexto/utilities';
import type { TripTracking } from './trip-card';

/** One thing about a trip that needs somebody to look at it. */
export interface TripAttentionNote {
  readonly id: 'no-driver' | 'no-vehicle' | 'not-departed' | 'not-reporting';
  readonly level: 'critical' | 'warning';
  readonly message: string;
}

/**
 * How long past its departure time a trip has to be before "it has not left" is worth saying.
 *
 * Ten minutes, because buses leave a few minutes late as a matter of routine and a board that
 * complained about every one of them would be a board nobody reads.
 */
const LATE_DEPARTURE_MINUTES = 10;

/**
 * What a trip card should be saying out loud.
 *
 * **Only from facts the API actually carries.** Every note below is a comparison of two values on
 * the trip itself or on the tracking feed the board already holds — a missing driver id, a missing
 * vehicle id, a departure time that has passed with no `actualStartAtUtc`, a bus that has stopped
 * reporting.
 *
 * **There is deliberately no "delayed".** Vexto records when a trip was due to start and when it
 * actually started; it records nothing about when it was due to *arrive*, so a card claiming a trip
 * is running late would be an opinion dressed as a fact — and a dispatcher would ring a driver
 * about it. "Has not departed" is a different statement, and it is one the data supports: the
 * scheduled instant has passed and no start was ever recorded.
 *
 * **There is no blocked-passenger count either.** Whether a passenger may travel is a question
 * about their invoices, and a board of twenty cards asking it per trip is exactly the front-end
 * aggregation the dashboard's attention panel exists instead of. The blocked count is on that
 * panel, once, for the whole operation.
 *
 * A pure function, so the rules are unit-tested rather than inspected in a rendered card.
 */
export function tripAttention(
  trip: TripResponse,
  tracking: TripTracking,
  now = new Date(),
): readonly TripAttentionNote[] {
  const notes: TripAttentionNote[] = [];
  const upcoming = trip.status === 'Scheduled' || trip.status === 'Ready';

  // Only for a trip that has not run. A completed journey with no recorded driver is a gap in the
  // history, not something anybody can still fix this morning.
  if (upcoming && !trip.driver) {
    notes.push({
      id: 'no-driver',
      level: 'critical',
      message: 'No driver assigned — this trip cannot depart.',
    });
  }

  if (upcoming && !trip.vehicle) {
    notes.push({
      id: 'no-vehicle',
      level: 'critical',
      message: 'No vehicle assigned — this trip cannot depart.',
    });
  }

  if (upcoming && !trip.actualStartAtUtc) {
    const late = -minutesUntil(trip.scheduledStartAtUtc, now);

    if (late >= LATE_DEPARTURE_MINUTES) {
      notes.push({
        id: 'not-departed',
        level: 'warning',
        message: `Due ${late} minutes ago and not yet started.`,
      });
    }
  }

  if (trip.status === 'Started' && tracking === 'offline') {
    notes.push({
      id: 'not-reporting',
      level: 'warning',
      message: 'Running, but the bus is not reporting its position.',
    });
  }

  return notes;
}
