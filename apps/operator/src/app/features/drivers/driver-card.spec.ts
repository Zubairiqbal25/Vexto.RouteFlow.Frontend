import { TestBed } from '@angular/core/testing';
import type { DriverResponse } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { DriverCard } from './driver-card';

/**
 * A date `days` from today, as the API would send it.
 *
 * Built from the local date parts rather than through `toISOString`, which converts to UTC first:
 * east of Greenwich, local midnight is the previous day in UTC, and the helper would silently
 * return day-1. The component compares against local midnight, so the fixture must too.
 */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function driver(overrides: Partial<DriverResponse> = {}): DriverResponse {
  return {
    id: 'd1',
    userId: null,
    firstName: 'Ahmed',
    lastName: 'Khan',
    mobileNumber: '+971500000001',
    email: null,
    licenseNumber: 'DXB1234567',
    licenseExpiryDate: isoDaysFromNow(400),
    status: 'Active',
    notes: null,
    hasPhoto: false,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    ...overrides,
  } as DriverResponse;
}

function render(input: DriverResponse) {
  const fixture = TestBed.createComponent(DriverCard);

  fixture.componentRef.setInput('driver', input);
  fixture.detectChanges();

  return fixture.nativeElement.textContent as string;
}

describe('DriverCard', () => {
  it('leads with the name, status and licence', () => {
    const text = render(driver());

    expect(text).toContain('Ahmed Khan');
    expect(text).toContain('DXB1234567');
    expect(text).toContain('Active');
  });

  it('stays quiet when the licence is comfortably valid', () => {
    const text = render(driver({ licenseExpiryDate: isoDaysFromNow(400) }));

    // A warning on every card is a warning nobody reads.
    expect(text).toContain('Licence valid until');
    expect(text).not.toContain('expires in');
  });

  it('warns when the licence expires inside the next month', () => {
    const text = render(driver({ licenseExpiryDate: isoDaysFromNow(14) }));

    expect(text).toContain('Licence expires in 14 days');
  });

  it('says "1 day" rather than "1 days"', () => {
    expect(render(driver({ licenseExpiryDate: isoDaysFromNow(1) }))).toContain(
      'Licence expires in 1 day',
    );
  });

  it('calls out a licence that expires today', () => {
    expect(render(driver({ licenseExpiryDate: isoDaysFromNow(0) }))).toContain(
      'Licence expires today',
    );
  });

  it('calls out an expired licence, which is a blocker rather than a warning', () => {
    const text = render(driver({ licenseExpiryDate: isoDaysFromNow(-3) }));

    expect(text).toContain('Licence expired');
  });

  it('marks the boundary at thirty days rather than warning at thirty-one', () => {
    expect(render(driver({ licenseExpiryDate: isoDaysFromNow(30) }))).toContain('expires in 30');
    expect(render(driver({ licenseExpiryDate: isoDaysFromNow(31) }))).toContain(
      'Licence valid until',
    );
  });
});
