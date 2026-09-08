import { TestBed } from '@angular/core/testing';
import type { OperatorPassengerAccess, PassengerResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { PassengerCard } from './passenger-card';

function passenger(overrides: Partial<PassengerResponse> = {}): PassengerResponse {
  return {
    id: 'p1',
    firstName: 'Muhammad',
    lastName: 'Zubair',
    mobileNumber: '+971500000000',
    email: 'zubair@example.test',
    status: 'Active',
    notes: null,
    hasPhoto: false,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  } as PassengerResponse;
}

function access(state: string, overrides: Partial<OperatorPassengerAccess> = {}) {
  return {
    passengerId: 'p1',
    state,
    isAllowedToTravel: state !== 'Blocked',
    amountOutstanding: state === 'Active' ? 0 : 420,
    currency: state === 'Active' ? null : 'AED',
    earliestDueDate: state === 'Active' ? null : '2026-09-01',
    gracePeriodEndsOn: state === 'GracePeriod' ? '2026-09-11' : null,
    ...overrides,
  } as OperatorPassengerAccess;
}

function render(inputs: { passenger: PassengerResponse; access?: OperatorPassengerAccess | null }) {
  const fixture = TestBed.createComponent(PassengerCard);

  fixture.componentRef.setInput('passenger', inputs.passenger);
  fixture.componentRef.setInput('access', inputs.access ?? null);
  fixture.detectChanges();

  return fixture;
}

describe('PassengerCard', () => {
  it('leads with the name and the operational state, not the contact details', () => {
    const text = render({ passenger: passenger(), access: access('Active') }).nativeElement
      .textContent as string;

    expect(text).toContain('Muhammad Zubair');
    expect(text).toContain('Transport access');
    expect(text).toContain('Active');
  });

  it('states that a blocked passenger cannot travel, in words', () => {
    const text = render({ passenger: passenger(), access: access('Blocked') }).nativeElement
      .textContent as string;

    // The state is spelled out rather than being carried by the band's colour alone.
    expect(text).toContain('Transport access suspended');
    expect(text).toContain('Blocked');
  });

  it('shows when a passenger is inside their grace period and by when', () => {
    const text = render({ passenger: passenger(), access: access('GracePeriod') }).nativeElement
      .textContent as string;

    expect(text).toContain('In grace period');
    expect(text).toContain('2026-09-11');
  });

  it('renders no access line at all when billing is not visible to this user', () => {
    const text = render({ passenger: passenger(), access: null }).nativeElement
      .textContent as string;

    // A dispatcher without Billing.View gets a card with no access claim, rather than a
    // placeholder describing what they are not allowed to know.
    expect(text).not.toContain('suspended');
    expect(text).not.toContain('In grace period');
  });

  it('never renders a financial amount on the card', () => {
    const text = render({ passenger: passenger(), access: access('Blocked') }).nativeElement
      .textContent as string;

    // The amount belongs on the passenger's own screen and on the billing pages, not on a card in
    // a grid somebody may be showing on a projector.
    expect(text).not.toContain('420');
  });

  it('offers Activate for an inactive passenger and Deactivate for an active one', () => {
    const active = render({ passenger: passenger({ status: 'Active' }) });
    const inactive = render({ passenger: passenger({ status: 'Inactive' }) });

    const ids = (fixture: ReturnType<typeof render>) =>
      (fixture.componentInstance as unknown as { actions: () => { id: string }[] })
        .actions()
        .map((action) => action.id);

    expect(ids(active)).toContain('deactivate');
    expect(ids(inactive)).toContain('activate');
  });
});
