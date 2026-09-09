/**
 * Whether a route can actually run, and what is stopping it.
 *
 * **One rule, two screens.** The card and the workspace used to each decide readiness for
 * themselves, with slightly different tests — the card said "No crew rostered" where the workspace
 * distinguished a missing driver from a missing bus, and neither ever said a route was ready. A
 * route that reads as fine on the list and as broken on its own page is worse than either.
 *
 * The order is the order somebody fixes them in: there is no point rostering a driver for a route
 * that stops nowhere, and no point scheduling one that collects nobody.
 *
 * A pure function over plain numbers, so both callers map their own shape onto it and the rules
 * have unit tests rather than a rendered component.
 */

export type RouteGapId =
  | 'stops'
  | 'schedule'
  | 'driver'
  | 'vehicle'
  | 'inactive'
  | 'capacity';

export type RouteGapLevel = 'critical' | 'warning';

export interface RouteGap {
  readonly id: RouteGapId;
  /** The short form for a card badge: "No schedule", "Missing driver". */
  readonly label: string;
  /** The sentence for a panel, saying what to do about it. */
  readonly detail: string;
  readonly level: RouteGapLevel;
}

/** What readiness is decided from. Both the list row and the detail summary can supply it. */
export interface RouteReadinessInput {
  readonly stopCount: number | string;
  readonly scheduleCount: number | string;
  readonly passengerCount: number | string;
  readonly driverId: string | null;
  readonly vehicleId: string | null;
  readonly vehicleCapacity: number | string | null;
  readonly status: string;
}

const count = (value: number | string | null | undefined): number => Number(value ?? 0);

export function routeGaps(input: RouteReadinessInput): readonly RouteGap[] {
  const gaps: RouteGap[] = [];

  if (count(input.stopCount) === 0) {
    gaps.push({
      id: 'stops',
      label: 'No stops',
      detail: 'Add the pickup and drop-off points before this route can run.',
      level: 'critical',
    });
  }

  if (count(input.scheduleCount) === 0) {
    gaps.push({
      id: 'schedule',
      label: 'No schedule',
      detail: 'Add the days and times this route departs.',
      level: 'critical',
    });
  }

  if (!input.driverId) {
    gaps.push({
      id: 'driver',
      label: 'Missing driver',
      detail: 'Assign a driver so generated trips have someone to run them.',
      level: 'warning',
    });
  }

  if (!input.vehicleId) {
    gaps.push({
      id: 'vehicle',
      label: 'Missing vehicle',
      detail: 'Assign a vehicle so passengers have somewhere to sit.',
      level: 'warning',
    });
  }

  if (input.status !== 'Active') {
    gaps.push({
      id: 'inactive',
      label: 'Not in service',
      detail: 'Activate this route before generating trips.',
      level: 'warning',
    });
  }

  if (isOverCapacity(input)) {
    gaps.push({
      id: 'capacity',
      label: 'Over capacity',
      detail: `${count(input.passengerCount)} passengers assigned to a ${count(input.vehicleCapacity)}-seat vehicle.`,
      level: 'warning',
    });
  }

  return gaps;
}

/**
 * More passengers than seats. Worth catching before the bus arrives rather than after.
 *
 * Only when a capacity is actually known: a route with no vehicle assigned is missing a vehicle,
 * which is already said above, and calling that "over capacity" would be two complaints about one
 * gap.
 */
export function isOverCapacity(input: RouteReadinessInput): boolean {
  return (
    input.vehicleCapacity !== null &&
    input.vehicleCapacity !== undefined &&
    count(input.passengerCount) > count(input.vehicleCapacity)
  );
}

/**
 * Ready means the API will accept a generate-trips call, not merely that nothing is red.
 *
 * Over capacity is deliberately not disqualifying: the trip still generates, and the operator may be
 * about to swap the bus.
 */
export function isRouteReady(gaps: readonly RouteGap[]): boolean {
  return gaps.every((gap) => gap.id === 'capacity');
}

/**
 * The one line a card shows.
 *
 * Null when the route is ready — the card says so with a badge instead, and an attention note that
 * said "Ready" would be an alert about nothing. Only the first blocking gap is named: a card listing
 * three problems is a card nobody reads to the end, and fixing the first often reveals the rest
 * anyway.
 */
export function primaryRouteGap(gaps: readonly RouteGap[]): RouteGap | null {
  return gaps.find((gap) => gap.id !== 'capacity') ?? gaps.find((gap) => gap.id === 'capacity') ?? null;
}
