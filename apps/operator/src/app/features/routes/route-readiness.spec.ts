import { describe, expect, it } from 'vitest';
import {
  type RouteReadinessInput,
  isOverCapacity,
  isRouteReady,
  primaryRouteGap,
  routeGaps,
} from './route-readiness';

function route(overrides: Partial<RouteReadinessInput> = {}): RouteReadinessInput {
  return {
    stopCount: 4,
    scheduleCount: 5,
    passengerCount: 20,
    driverId: 'd1',
    vehicleId: 'v1',
    vehicleCapacity: 30,
    status: 'Active',
    ...overrides,
  };
}

const ids = (input: RouteReadinessInput) => routeGaps(input).map((gap) => gap.id);

describe('route readiness', () => {
  it('finds nothing wrong with a fully configured route', () => {
    expect(routeGaps(route())).toEqual([]);
    expect(isRouteReady(routeGaps(route()))).toBe(true);
  });

  it('orders gaps the way somebody fixes them', () => {
    // No point rostering a driver for a route that stops nowhere.
    expect(
      ids(route({ stopCount: 0, scheduleCount: 0, driverId: null, vehicleId: null })),
    ).toEqual(['stops', 'schedule', 'driver', 'vehicle']);
  });

  it('separates a missing driver from a missing vehicle', () => {
    // Two different jobs for the dispatcher, so two different gaps.
    expect(ids(route({ driverId: null }))).toEqual(['driver']);
    expect(ids(route({ vehicleId: null }))).toEqual(['vehicle']);
  });

  it('treats a route that is not in service as unable to run', () => {
    expect(ids(route({ status: 'Draft' }))).toEqual(['inactive']);
    expect(isRouteReady(routeGaps(route({ status: 'Draft' })))).toBe(false);
  });

  it('warns about over capacity without calling the route unready', () => {
    // The trip still generates, and the operator may be about to swap the bus.
    const gaps = routeGaps(route({ passengerCount: 40, vehicleCapacity: 30 }));

    expect(gaps.map((gap) => gap.id)).toEqual(['capacity']);
    expect(isRouteReady(gaps)).toBe(true);
  });

  it('does not call a route with no vehicle "over capacity"', () => {
    // That is one gap, not two: the vehicle is missing, which is already said.
    expect(isOverCapacity(route({ vehicleId: null, vehicleCapacity: null }))).toBe(false);
    expect(ids(route({ vehicleId: null, vehicleCapacity: null }))).toEqual(['vehicle']);
  });

  it('names the first blocking gap for a card, not the capacity warning', () => {
    const gaps = routeGaps(route({ scheduleCount: 0, passengerCount: 40, vehicleCapacity: 30 }));

    expect(primaryRouteGap(gaps)?.id).toBe('schedule');
  });

  it('falls back to the capacity warning when nothing blocks', () => {
    const gaps = routeGaps(route({ passengerCount: 40, vehicleCapacity: 30 }));

    expect(primaryRouteGap(gaps)?.id).toBe('capacity');
  });

  it('has nothing to say about a ready route', () => {
    expect(primaryRouteGap(routeGaps(route()))).toBeNull();
  });
});
