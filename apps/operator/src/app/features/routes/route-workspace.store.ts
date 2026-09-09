import { Injectable, computed, inject, signal } from '@angular/core';
import { RoutesApi, TripsApi, VextoApiError } from '@vexto/api-client';
import type {
  RouteDetailResponse,
  RouteMapPreview,
  RoutePassengerAssignment,
  RouteResourceAssignment,
  RouteSchedule,
  RouteStop,
  TripResponse,
} from '@vexto/models';
import { serviceDate } from '@vexto/utilities';

/**
 * One reason a route cannot yet produce trips.
 *
 * Phrased as the thing that is missing rather than as an error, because that is what the operator
 * has to go and do: "Missing driver" is a task, "validation failed" is not.
 */
// The gap shape and the rules that produce it live in route-readiness.ts, so the workspace and the
// route card cannot disagree about whether a route is ready. Re-exported because callers already
// import RouteGap from here.
export type { RouteGap } from './route-readiness';

import {
  type RouteGap,
  type RouteReadinessInput,
  isOverCapacity,
  isRouteReady,
  routeGaps,
} from './route-readiness';

/**
 * Everything the route workspace knows, loaded once.
 *
 * **The whole reason this exists is that the tabs used to each fetch their own copy.** Stops were
 * requested by the stops tab, again by the passengers tab and again by the map; opening four tabs
 * on one route cost eleven requests for six answers. The workspace loads each collection once, and
 * the tabs read signals — so switching tabs is instant and a mutation refreshes exactly the
 * collections it touched.
 *
 * Provided by `RouteDetailPage`, never in root: its lifetime is one route on one screen.
 */
@Injectable()
export class RouteWorkspaceStore {
  private readonly api = inject(RoutesApi);
  private readonly tripsApi = inject(TripsApi);

  private routeId = '';

  readonly detail = signal<RouteDetailResponse | null>(null);
  readonly stops = signal<RouteStop[]>([]);
  readonly passengers = signal<RoutePassengerAssignment[]>([]);
  readonly resources = signal<RouteResourceAssignment[]>([]);
  readonly schedules = signal<RouteSchedule[]>([]);
  readonly trips = signal<TripResponse[]>([]);
  readonly preview = signal<RouteMapPreview | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly previewFailed = signal(false);

  /** The stop the timeline and the map are both pointing at. Null means nothing is chosen. */
  readonly selectedStopId = signal<string | null>(null);

  /**
   * How many passengers board at each stop.
   *
   * Derived rather than fetched: the assignments already carry `routeStopId`, so a per-stop count
   * endpoint would be a second request for arithmetic the client can do on data it holds.
   */
  readonly pickupCounts = computed(() => {
    const counts = new Map<string, number>();

    for (const assignment of this.passengers()) {
      if (assignment.status !== 'Active') {
        continue;
      }

      counts.set(assignment.routeStopId, (counts.get(assignment.routeStopId) ?? 0) + 1);
    }

    return counts;
  });

  /** The assignment currently in force, which is the one the overview leads with. */
  readonly currentResource = computed<RouteResourceAssignment | null>(
    () => this.resources().find((assignment) => assignment.status === 'Active') ?? null,
  );

  /**
   * Trips still ahead of this route, soonest first. The overview shows the first as "next".
   *
   * **Status alone is not enough.** A trip that was scheduled for last Monday and never ran is
   * still `Scheduled`, and filtering on that put a date three days in the past under the heading
   * "Next trip" — which is not a small cosmetic wrong: a planner reads that line to decide whether
   * the route is covered tomorrow. The service date has to be today or later as well.
   */
  readonly upcomingTrips = computed(() => {
    const today = serviceDate();

    return this.trips()
      .filter(
        (trip) =>
          (trip.status === 'Scheduled' || trip.status === 'Ready') && trip.serviceDate >= today,
      )
      .sort((left, right) => left.scheduledStartAtUtc.localeCompare(right.scheduledStartAtUtc));
  });

  readonly nextTrip = computed<TripResponse | null>(() => this.upcomingTrips()[0] ?? null);

  readonly activeSchedules = computed(() =>
    this.schedules()
      .filter((schedule) => schedule.isActive)
      .sort((left, right) => DAY_ORDER.indexOf(left.dayOfWeek) - DAY_ORDER.indexOf(right.dayOfWeek)),
  );

  /**
   * What readiness is decided from, in the shape the shared rules take. Mapped here so the rules
   * themselves never learn what a route detail response looks like.
   */
  private readonly readinessInput = computed<RouteReadinessInput | null>(() => {
    const detail = this.detail();

    if (!detail) {
      return null;
    }

    return {
      stopCount: detail.summary.activeStopCount,
      scheduleCount: detail.summary.activeScheduleCount,
      passengerCount: detail.summary.activePassengerCount,
      driverId: detail.summary.currentDriverId,
      vehicleId: detail.summary.currentVehicleId,
      vehicleCapacity: detail.summary.currentVehicleCapacity,
      status: detail.route.status,
    };
  });

  /** More passengers than seats. Worth catching before the bus arrives, not after. */
  readonly overCapacity = computed(() => {
    const input = this.readinessInput();

    return input ? isOverCapacity(input) : false;
  });

  /**
   * What stands between this route and a generated trip.
   *
   * The rules are in route-readiness.ts, shared with the route card, so a route cannot read as fine
   * on the list and broken on its own page.
   */
  readonly gaps = computed<readonly RouteGap[]>(() => {
    const input = this.readinessInput();

    return input ? routeGaps(input) : [];
  });

  /** Ready means the API will accept a generate-trips call, not merely that nothing is red. */
  readonly ready = computed(() => isRouteReady(this.gaps()));

  /**
   * Loads everything for a route.
   *
   * Seven parallel requests once per route, rather than the same six repeated per tab. Each failure
   * is contained: a map provider outage greys the map panel and leaves the rest of the workspace
   * working, because a route is still fully editable without a picture of it.
   */
  load(routeId: string): void {
    this.routeId = routeId;
    this.loading.set(true);
    this.error.set(null);

    this.api.get(routeId).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load this route.',
        );
      },
    });

    this.refreshStops();
    this.refreshPassengers();
    this.refreshResources();
    this.refreshSchedules();
    this.refreshTrips();
    this.refreshPreview();
  }

  /** Re-reads the summary counts after a mutation, without disturbing the collections. */
  refreshDetail(): void {
    this.api.get(this.routeId).subscribe({
      next: (detail) => this.detail.set(detail),
      error: () => undefined,
    });
  }

  refreshStops(): void {
    this.api.stops(this.routeId).subscribe({
      next: (stops) => this.stops.set(sortStops(stops)),
      error: () => this.stops.set([]),
    });
  }

  refreshPassengers(): void {
    this.api.passengers(this.routeId).subscribe({
      next: (assignments) => this.passengers.set(assignments),
      error: () => this.passengers.set([]),
    });
  }

  refreshResources(): void {
    this.api.resources(this.routeId).subscribe({
      next: (assignments) => this.resources.set(assignments),
      error: () => this.resources.set([]),
    });
  }

  refreshSchedules(): void {
    this.api.schedules(this.routeId).subscribe({
      next: (schedules) => this.schedules.set(schedules),
      error: () => this.schedules.set([]),
    });
  }

  /**
   * The trips this route is about to run.
   *
   * Deliberately a small page ordered by service date: a route that has been running for a year has
   * hundreds of trips, and the workspace question is "what is next", never "what happened in March".
   */
  refreshTrips(): void {
    this.tripsApi.list({ routeId: this.routeId, pageSize: 10 }).subscribe({
      next: (result) => this.trips.set(result.items),
      error: () => this.trips.set([]),
    });
  }

  refreshPreview(): void {
    this.previewFailed.set(false);

    this.api.mapPreview(this.routeId).subscribe({
      next: (preview) => this.preview.set(preview),
      error: () => {
        this.preview.set(null);
        this.previewFailed.set(true);
      },
    });
  }

  /** Applies a stop reordering locally so the timeline renumbers before the request returns. */
  setStops(stops: readonly RouteStop[]): void {
    this.stops.set(sortStops(stops));
  }

  selectStop(stopId: string | null): void {
    this.selectedStopId.update((current) => (current === stopId ? null : stopId));
  }
}

const DAY_ORDER: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function sortStops(stops: readonly RouteStop[]): RouteStop[] {
  return [...stops].sort((left, right) => Number(left.sequence) - Number(right.sequence));
}
