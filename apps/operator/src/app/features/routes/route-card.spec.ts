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

  it('says a ready route is ready rather than saying nothing', () => {
    // "Active" was never the answer to "can this route run": an active route with no schedule
    // generates nothing and used to look identical to one that was fine.
    const rendered = text(item());

    expect(rendered).toContain('Ready to run');
    expect(rendered).not.toContain('Add the pickup');
    expect(rendered).not.toContain('Add the days');
    expect(rendered).not.toContain('Assign a driver');
  });

  it('flags a route with no stops before anything else', () => {
    // Without stops there is nothing to schedule, so this is the first thing that blocks.
    const rendered = text(item({ stopCount: 0, scheduleCount: 0, currentDriverId: null }));

    expect(rendered).toContain('Add the pickup and drop-off points');
    expect(rendered).not.toContain('Add the days and times');
    expect(rendered).not.toContain('Ready to run');
  });

  it('flags a missing schedule once stops exist', () => {
    expect(text(item({ scheduleCount: 0 }))).toContain('Add the days and times');
  });

  it('mentions a missing driver only when stops and a schedule are in place', () => {
    expect(text(item({ currentDriverId: null, currentDriverName: null }))).toContain(
      'Assign a driver',
    );
  });

  it('names the missing vehicle when only the bus is unassigned', () => {
    // Driver and vehicle are separate gaps because they are separate jobs for the dispatcher.
    expect(
      text(item({ currentVehicleId: null, currentVehiclePlateNumber: null })),
    ).toContain('Assign a vehicle');
  });

  it('treats a route that is not in service as not ready', () => {
    const route = item();
    const draft = { ...route, route: { ...route.route, status: 'Draft' } } as RouteListItem;

    expect(text(draft)).toContain('Activate this route');
    expect(text(draft)).not.toContain('Ready to run');
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
