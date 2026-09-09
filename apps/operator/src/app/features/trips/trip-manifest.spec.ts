import { TestBed } from '@angular/core/testing';
import type { OperatorManifestPassenger } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { TripManifest } from './trip-manifest';

function row(overrides: Partial<OperatorManifestPassenger> = {}): OperatorManifestPassenger {
  return {
    id: 'tp1',
    passengerId: 'p1',
    name: 'Muhammad Zubair',
    routeStopId: 's1',
    stop: 'DSO Building 12',
    sequence: 4,
    status: 'Expected',
    accessState: 'Active',
    hasPhoto: false,
    boardedAtUtc: null,
    noShowAtUtc: null,
    droppedOffAtUtc: null,
    ...overrides,
  } as OperatorManifestPassenger;
}

function render(rows: readonly OperatorManifestPassenger[], editable = false) {
  const fixture = TestBed.createComponent(TripManifest);

  fixture.componentRef.setInput('passengers', rows);
  fixture.componentRef.setInput('editable', editable);
  fixture.detectChanges();

  return fixture;
}

const text = (rows: readonly OperatorManifestPassenger[], editable = false) =>
  render(rows, editable).nativeElement.textContent as string;

describe('TripManifest', () => {
  it('shows the passenger, their stop and their place in the order', () => {
    const rendered = text([row()]);

    expect(rendered).toContain('Muhammad Zubair');
    expect(rendered).toContain('DSO Building 12');
    expect(rendered).toContain('04');
  });

  it('badges an access state that changes what happens at the kerb', () => {
    // The regression this exists for: a dispatcher fielding "the bus did not stop for me" could not
    // see that the passenger was blocked, because only the driver's screen showed it.
    expect(text([row({ accessState: 'Blocked' })])).toContain('Blocked');
    expect(text([row({ accessState: 'GracePeriod' })])).toContain('In grace period');
  });

  it('does not badge the normal case', () => {
    // A pill on every row leaves the one that matters no louder than the rest.
    const rendered = text([row({ accessState: 'Active' })]);

    expect(rendered).toContain('Expected');
    expect(rendered).not.toContain('Active');
  });

  it('never shows an amount, a due date or an invoice number', () => {
    // A trip manifest is an operational surface. The figures live on the billing screens.
    const rendered = text([row({ accessState: 'Blocked' })]);

    expect(rendered).not.toMatch(/AED|invoice|due/iu);
  });

  it('orders by stop sequence, with unplaced passengers last', () => {
    const rendered = text([
      row({ id: 'c', name: 'Carla', sequence: null }),
      row({ id: 'b', name: 'Bilal', sequence: 9 }),
      row({ id: 'a', name: 'Aisha', sequence: 2 }),
    ]);

    expect(rendered.indexOf('Aisha')).toBeLessThan(rendered.indexOf('Bilal'));
    expect(rendered.indexOf('Bilal')).toBeLessThan(rendered.indexOf('Carla'));
  });

  it('offers attendance buttons only when the host says the state allows it', () => {
    expect(text([row()], false)).not.toContain('Boarded');
    expect(text([row()], true)).toContain('No show');
  });

  it('explains an empty manifest rather than showing nothing', () => {
    expect(text([])).toContain('No passengers expected for this trip');
  });

  it('emits the row when it is opened, so the host can show the quick view', () => {
    const fixture = render([row()]);
    const opened: string[] = [];

    fixture.componentInstance.opened.subscribe((passenger) => opened.push(passenger.name));

    const button = fixture.nativeElement.querySelector(
      'button[aria-label="Open Muhammad Zubair"]',
    ) as HTMLButtonElement;

    button.click();

    expect(opened).toEqual(['Muhammad Zubair']);
  });
});
