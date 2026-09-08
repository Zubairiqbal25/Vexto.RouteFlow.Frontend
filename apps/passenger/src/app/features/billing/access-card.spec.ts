import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import type { PassengerAccessStatus } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { PassengerAccessCard } from './access-card';

function status(overrides: Partial<PassengerAccessStatus> = {}): PassengerAccessStatus {
  return {
    state: 'Active',
    isAllowedToTravel: true,
    amountOutstanding: 0,
    currency: null,
    earliestDueDate: null,
    gracePeriodEndsOn: null,
    ...overrides,
  } as PassengerAccessStatus;
}

function render(value: PassengerAccessStatus | null, operator: string | null = 'Al Noor Transport') {
  const fixture = TestBed.createComponent(PassengerAccessCard);

  fixture.componentRef.setInput('status', value);
  fixture.componentRef.setInput('operator', operator);
  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

describe('PassengerAccessCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('confirms when nothing is owed, rather than showing nothing at all', () => {
    const element = render(status());

    expect(element.textContent).toContain('Payments up to date');

    // No Pay button when there is nothing to pay.
    expect(element.querySelector('a[href="/billing"]')).toBeNull();
  });

  it('tells a passenger in their grace period how long they may keep travelling', () => {
    const element = render(
      status({
        state: 'GracePeriod',
        amountOutstanding: 420,
        currency: 'AED',
        gracePeriodEndsOn: '2026-09-11',
      }),
    );

    expect(element.textContent).toContain('Payment overdue');
    expect(element.textContent).toContain('keep travelling until');
    expect(element.querySelector('a[href="/billing"]')).not.toBeNull();
  });

  it('says an overdue passenger is still able to travel when the operator does not block', () => {
    const element = render(
      status({
        state: 'PaymentOverdue',
        amountOutstanding: 420,
        currency: 'AED',
        earliestDueDate: '2026-09-01',
      }),
    );

    expect(element.textContent).toContain('still able to travel');
  });

  it('keeps Pay Now available to a blocked passenger', () => {
    const element = render(
      status({
        state: 'Blocked',
        isAllowedToTravel: false,
        amountOutstanding: 420,
        currency: 'AED',
      }),
    );

    expect(element.textContent).toContain('Transport access suspended');

    // The whole point of the blocked experience: this app is the only place they can settle the
    // thing that suspended them, so the payment route must never be hidden.
    expect(element.querySelector('a[href="/billing"]')).not.toBeNull();
  });

  it('shows a blocked passenger the amount and who to contact', () => {
    const element = render(
      status({ state: 'Blocked', isAllowedToTravel: false, amountOutstanding: 420, currency: 'AED' }),
    );

    expect(element.textContent).toContain('420');
    expect(element.textContent).toContain('Al Noor Transport');
  });

  it('renders nothing until the status is known', () => {
    // Better than guessing: a card that briefly claims "up to date" and then corrects itself is
    // worse than a moment of nothing.
    expect(render(null).textContent?.trim()).toBe('');
  });
});
