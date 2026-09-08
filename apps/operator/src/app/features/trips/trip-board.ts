import type { TripResponse } from '@vexto/models';

/** One dated band on the operations board. */
export interface TripGroup {
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly trips: readonly TripResponse[];
}

/**
 * How urgently a dispatcher needs to look at a trip, lowest number first.
 *
 * A running trip is the only one they can act on right now, so it goes to the top. Ready and
 * Scheduled follow in the order the day will happen. Completed sinks — it needs no attention —
 * and Cancelled sinks furthest, because a called-off service is a fact rather than a task.
 */
const STATUS_PRIORITY: Readonly<Record<string, number>> = {
  Started: 0,
  Ready: 1,
  Scheduled: 2,
  Completed: 3,
  Cancelled: 4,
};

function priorityOf(trip: TripResponse): number {
  return STATUS_PRIORITY[trip.status] ?? 2;
}

/** Local calendar date as `yyyy-MM-dd`, matching the service date the API sends. */
function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Arranges trips into the bands an operations board is read in.
 *
 * **Today, Tomorrow, Upcoming, Earlier.** Not one long list sorted by date: a dispatcher's question
 * is "what needs me now", and everything after today is planning rather than operations. Past trips
 * are kept — attendance is often reviewed the next morning — but they are last and clearly labelled.
 *
 * Within a band, urgency wins over the clock: a trip that is running sorts above one that departs
 * earlier and has already finished. Inside one status, the departure time orders them, so the band
 * still reads as a timetable.
 *
 * Empty bands are dropped. A heading over nothing looks like a bug, and "Tomorrow — no trips" on a
 * screen that has plenty today is noise.
 */
export function groupTrips(trips: readonly TripResponse[]): readonly TripGroup[] {
  const today = localDate();
  const tomorrow = localDate(1);

  const buckets: Record<string, TripResponse[]> = {
    today: [],
    tomorrow: [],
    upcoming: [],
    earlier: [],
  };

  for (const trip of trips) {
    if (trip.serviceDate === today) {
      buckets['today']!.push(trip);
    } else if (trip.serviceDate === tomorrow) {
      buckets['tomorrow']!.push(trip);
    } else if (trip.serviceDate > today) {
      buckets['upcoming']!.push(trip);
    } else {
      buckets['earlier']!.push(trip);
    }
  }

  const order = (band: TripResponse[], byPriority: boolean) =>
    [...band].sort((left, right) => {
      if (byPriority) {
        const difference = priorityOf(left) - priorityOf(right);

        if (difference !== 0) {
          return difference;
        }
      }

      return left.serviceDate === right.serviceDate
        ? left.scheduledStartAtUtc.localeCompare(right.scheduledStartAtUtc)
        : left.serviceDate.localeCompare(right.serviceDate);
    });

  const groups: TripGroup[] = [
    {
      key: 'today',
      label: 'Today',
      description: 'Running first, then what is still to depart.',

      // Only today is sorted by urgency. Tomorrow has no running trips, and sorting a plan by
      // status rather than by time makes it stop reading as a schedule.
      trips: order(buckets['today']!, true),
    },
    {
      key: 'tomorrow',
      label: 'Tomorrow',
      description: null,
      trips: order(buckets['tomorrow']!, false),
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      description: null,
      trips: order(buckets['upcoming']!, false),
    },
    {
      key: 'earlier',
      label: 'Earlier',
      description: 'Trips that have already run.',

      // Most recent first: yesterday's attendance is looked at far more often than last month's.
      trips: order(buckets['earlier']!, false).reverse(),
    },
  ];

  return groups.filter((group) => group.trips.length > 0);
}
