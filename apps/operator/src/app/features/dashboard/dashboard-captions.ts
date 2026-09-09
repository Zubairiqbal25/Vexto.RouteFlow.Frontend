/**
 * The sentences under the dashboard's numbers.
 *
 * **Every caption is derived from the value it sits beneath.** They are gathered here, as pure
 * functions, because the failure they exist to prevent is specific and was real: a caption written
 * as a constant in a template goes on saying the same thing after the number under it has changed,
 * and "Nobody missed a pickup" printed beneath a no-show count of five is not a cosmetic bug — it is
 * the dashboard telling a dispatcher the opposite of what happened.
 *
 * Pure functions with no Angular in them, so each one is a unit test rather than a rendered
 * component. If a caption can be wrong, it can be tested.
 */

/** Today's trips, by state. Strings are accepted because JSON numbers may arrive as either. */
export interface TripDayCounts {
  readonly scheduledTrips: number | string;
  readonly readyTrips: number | string;
  readonly startedTrips: number | string;
  readonly completedTrips: number | string;
  readonly cancelledTrips: number | string;
}

export interface TrackingCounts {
  readonly liveVehicles: number | string;
  readonly staleVehicles: number | string;
  readonly offlineVehicles: number | string;
}

export interface AttendanceCounts {
  readonly expected: number | string;
  readonly boarded: number | string;
  readonly noShow: number | string;
  readonly skipped: number | string;
}

const count = (value: number | string | null | undefined): number => Number(value ?? 0);

const plural = (value: number, singular: string, prefix = ''): string =>
  `${prefix}${value} ${value === 1 ? singular : `${singular}s`}`;

/**
 * What sits under "Buses running".
 *
 * The distinction that matters is between *nothing is running* and *things are running and none of
 * them is reporting*. The first is a quiet morning; the second is a fleet that has gone dark, and a
 * caption that says "Nothing reporting" for both would raise an alarm every night and hide a real
 * one during the day.
 */
export function trackingCaption(
  tracking: TrackingCounts | null | undefined,
  runningTrips: number | string | null | undefined,
): string | null {
  if (!tracking) {
    return null;
  }

  const parts: string[] = [];

  if (count(tracking.liveVehicles) > 0) {
    parts.push(`${count(tracking.liveVehicles)} live`);
  }

  if (count(tracking.staleVehicles) > 0) {
    parts.push(`${count(tracking.staleVehicles)} stale`);
  }

  if (count(tracking.offlineVehicles) > 0) {
    parts.push(`${count(tracking.offlineVehicles)} offline`);
  }

  if (parts.length > 0) {
    return parts.join(' · ');
  }

  return count(runningTrips) === 0 ? 'No trips under way' : 'Nothing reporting';
}

/** What sits under "Today's trips". Says what the day has actually come to. */
export function tripsCaption(today: TripDayCounts | null | undefined): string | null {
  if (!today) {
    return null;
  }

  const total = totalTrips(today);

  if (total === 0) {
    return 'Nothing scheduled today';
  }

  const parts = [`${count(today.completedTrips)} completed`];

  if (count(today.cancelledTrips) > 0) {
    return [...parts, `${count(today.cancelledTrips)} cancelled`].join(' · ');
  }

  return parts.join(' · ');
}

export function totalTrips(today: TripDayCounts): number {
  return (
    count(today.scheduledTrips) +
    count(today.readyTrips) +
    count(today.startedTrips) +
    count(today.completedTrips) +
    count(today.cancelledTrips)
  );
}

/**
 * What sits under "Boarded today".
 *
 * "of 0 expected" is a denominator that makes the number above it meaningless, so a day with nobody
 * due to travel says that instead.
 */
export function boardedCaption(attendance: AttendanceCounts | null | undefined): string | null {
  if (!attendance) {
    return null;
  }

  const expected = count(attendance.expected);

  return expected === 0 ? 'Nobody is due to travel' : `of ${expected} expected`;
}

/**
 * What sits under "No-shows today".
 *
 * It describes the *absences*, which is the number this line counts — the tile's own number is
 * no-shows. The two are different facts and the caption used to conflate them: "Nobody missed a
 * pickup" sat under a no-show count of five and read as a denial of it.
 */
export function absencesCaption(attendance: AttendanceCounts | null | undefined): string {
  const skipped = count(attendance?.skipped);

  return skipped > 0 ? `${plural(skipped, 'absence')} declared` : 'No absences declared';
}

/**
 * What sits under "Active routes".
 *
 * Not "Carrying passengers", which was a constant and was false for every operator whose routes had
 * been created but not yet populated — which is every operator on their first day.
 */
export function activeRoutesCaption(activeRoutes: number | string | null | undefined): string {
  return count(activeRoutes) === 0 ? 'None active yet' : 'In the timetable';
}

/**
 * What sits under "Active drivers".
 *
 * "Available to assign" was a constant and was wrong for every driver already out on a trip. This
 * says what the number is instead of guessing what it implies.
 */
export function activeDriversCaption(activeDrivers: number | string | null | undefined): string {
  return count(activeDrivers) === 0 ? 'None cleared to drive' : 'Cleared to drive';
}

export function activeVehiclesCaption(activeVehicles: number | string | null | undefined): string {
  return count(activeVehicles) === 0 ? 'None in service' : 'In service';
}

export function activePassengersCaption(
  activePassengers: number | string | null | undefined,
): string {
  return count(activePassengers) === 0 ? 'Nobody enrolled yet' : 'Cleared to travel';
}
