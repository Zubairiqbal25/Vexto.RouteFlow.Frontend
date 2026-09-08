import { TestBed } from '@angular/core/testing';
import type { RouteListItem } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { RouteCard } from './route-card';

function item(overrides: Partial<RouteListItem> = {}): RouteListItem {
  return {
    route: {
      id: 'r1',
      code: 'DSO-BB-AM',
      name: 'DSO → Business Bay',
      description: null,
      direction: 'Outbound',
      defaultStartTime: '06:00:00',
      status: 'Active',
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: null,
    },
    stopCount: 12,
    activePassengerCount: 24,
    scheduleCount: 5,
    currentDriverId: 'd1',
    currentDriverName: 'Ahmed Khan',
    currentVehicleId: 'v1',
    currentVehiclePlateNumber: 'A 12345',
    ...overrides,
  } as RouteListItem;
}

function render(input: RouteListItem) {
  const fixture = TestBed.createComponent(RouteCard);

  fixture.componentRef.setInput('item', input);
  fixture.detectChanges();

  return fixture;
}

function text(input: RouteListItem): string {
  return render(input).nativeElement.textContent as string;
}

function actions(input: RouteListItem) {
  return (
    render(input).componentInstance as unknown as {
      actions: () => { id: string; disabled?: boolean }[];
    }
  ).actions();
}

describe('RouteCard', () => {
  it('leads with the journey and carries the code beneath it', () => {
    const rendered = text(item());

    expect(rendered).toContain('DSO → Business Bay');
    expect(rendered).toContain('DSO-BB-AM');
  });

  it('shows the operational counts a dispatcher scans for', () => {
    const rendered = text(item());

    expect(rendered).toContain('12 stops');
    expect(rendered).toContain('24');
    expect(rendered).toContain('Ahmed Khan');
    expect(rendered).toContain('A 12345');
  });

  it('stays quiet when the route is ready to run', () => {
    const rendered = text(item());

    expect(rendered).not.toContain('No stops yet');
    expect(rendered).not.toContain('No schedule');
    expect(rendered).not.toContain('No crew');
  });

  it('flags a route with no stops before anything else', () => {
    // Without stops there is nothing to schedule, so this is the first thing that blocks.
    const rendered = text(item({ stopCount: 0, scheduleCount: 0, currentDriverId: null }));

    expect(rendered).toContain('No stops yet');
    expect(rendered).not.toContain('No schedule');
  });

  it('flags a missing schedule once stops exist', () => {
    expect(text(item({ scheduleCount: 0 }))).toContain('trips cannot be generated');
  });

  it('mentions missing crew only when stops and a schedule are in place', () => {
    expect(text(item({ currentDriverId: null, currentDriverName: null }))).toContain(
      'No crew rostered',
    );
  });

  it('disables Generate trips when the route has no schedule', () => {
    const generate = actions(item({ scheduleCount: 0 })).find((action) => action.id === 'generate');

    // Offering it when it cannot succeed only produces an error the operator has to decode.
    expect(generate?.disabled).toBe(true);
  });

  it('disables Generate trips for a route that is not active', () => {
    const route = item();
    const inactive = { ...route, route: { ...route.route, status: 'Draft' } } as RouteListItem;

    expect(actions(inactive).find((action) => action.id === 'generate')?.disabled).toBe(true);
  });

  it('enables Generate trips for an active, scheduled route', () => {
    expect(actions(item()).find((action) => action.id === 'generate')?.disabled).toBe(false);
  });

  it('describes an unscheduled route as not scheduled rather than as zero', () => {
    expect(text(item({ scheduleCount: 0 }))).toContain('Not scheduled');
  });
});
