import { TestBed } from '@angular/core/testing';
import type { VehicleOperations, VehicleResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { VehicleCard } from './vehicle-card';

function vehicle(overrides: Partial<VehicleResponse> = {}): VehicleResponse {
  return {
    id: 'v1',
    plateNumber: '12345',
    plateCode: 'A',
    emirate: 'Dubai',
    vehicleType: 'MiniBus',
    make: 'Toyota',
    model: 'Coaster',
    year: 2022,
    capacity: 24,
    status: 'Active',
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  } as VehicleResponse;
}

function operations(overrides: Partial<VehicleOperations> = {}): VehicleOperations {
  return {
    vehicleId: 'v1',
    activeTripId: null,
    activeRouteName: null,
    activeDriverName: null,
    nextTripId: null,
    nextRouteName: null,
    nextDepartureAtUtc: null,
    ...overrides,
  } as VehicleOperations;
}

function render(input: VehicleResponse, ops: VehicleOperations | null = null) {
  const fixture = TestBed.createComponent(VehicleCard);

  fixture.componentRef.setInput('vehicle', input);
  fixture.componentRef.setInput('operations', ops);
  fixture.detectChanges();

  return fixture.nativeElement.textContent as string;
}

describe('VehicleCard', () => {
  it('leads with the full plate, which is how an operator refers to a bus', () => {
    expect(render(vehicle())).toContain('Dubai A 12345');
  });

  it('shows what it is running now, and who is driving it', () => {
    const text = render(
      vehicle(),
      operations({
        activeTripId: 't1',
        activeRouteName: 'DSO → Business Bay',
        activeDriverName: 'Ahmed Khan',
      }),
    );

    expect(text).toContain('On trip');
    expect(text).toContain('DSO → Business Bay');
    expect(text).toContain('Ahmed Khan');
  });

  it('falls back to the next departure when nothing is running', () => {
    const text = render(
      vehicle(),
      operations({ nextTripId: 't2', nextRouteName: 'Evening Return', nextDepartureAtUtc: '2026-09-08T14:00:00Z' }),
    );

    expect(text).toContain('Next out');
    expect(text).toContain('Evening Return');
    expect(text).not.toContain('On trip');
  });

  it('says an idle vehicle is available, rather than showing nothing', () => {
    expect(render(vehicle(), operations())).toContain('Available to assign');
  });

  it('renders no assignment line at all while operations are still loading', () => {
    const text = render(vehicle(), null);

    // Loading and idle are genuinely different, and the card must not claim availability it has
    // not confirmed.
    expect(text).not.toContain('Available to assign');
    expect(text).not.toContain('Next out');
  });

  it('warns that a vehicle in maintenance cannot be rostered', () => {
    const text = render(vehicle({ status: 'Maintenance' }));

    expect(text).toContain('In maintenance');
    expect(text).toContain('not available to roster');
  });

  it('is quieter about a retired vehicle than about one in maintenance', () => {
    expect(render(vehicle({ status: 'Inactive' }))).toContain('Retired from service');
  });

  it('offers a return to service for a vehicle in maintenance', () => {
    const fixture = TestBed.createComponent(VehicleCard);
    fixture.componentRef.setInput('vehicle', vehicle({ status: 'Maintenance' }));
    fixture.detectChanges();

    const ids = (
      fixture.componentInstance as unknown as { actions: () => { id: string; label: string }[] }
    )
      .actions()
      .map((action) => action.label);

    expect(ids).toContain('Return to service');
  });
});
