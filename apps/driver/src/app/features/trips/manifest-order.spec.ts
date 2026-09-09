import type { DriverManifestPassenger } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { isNotToBeCarried, manifestGroups, nextPassenger } from './manifest-order';

function passenger(overrides: Partial<DriverManifestPassenger> = {}): DriverManifestPassenger {
  return {
    id: 'tp1',
    passengerId: 'p1',
    name: 'Aisha',
    routeStopId: 's1',
    stop: 'DSO Building 12',
    sequence: 1,
    status: 'Expected',
    accessState: 'Active',
    hasPhoto: false,
    boardedAtUtc: null,
    noShowAtUtc: null,
    droppedOffAtUtc: null,
    ...overrides,
  } as DriverManifestPassenger;
}

/** The API returns the manifest in route order; these tests preserve that assumption explicitly. */
const inRouteOrder = (...people: DriverManifestPassenger[]) => people;

const groupNames = (people: readonly DriverManifestPassenger[]) =>
  Object.fromEntries(
    manifestGroups(people).map((group) => [
      group.key,
      group.passengers.map((person) => person.name),
    ]),
  );

describe('driver manifest ordering', () => {
  it('picks the first person still expected, in route order', () => {
    const people = inRouteOrder(
      passenger({ id: 'a', name: 'Aisha', sequence: 1, status: 'Boarded' }),
      passenger({ id: 'b', name: 'Bilal', sequence: 2 }),
      passenger({ id: 'c', name: 'Carla', sequence: 3 }),
    );

    expect(nextPassenger(people)?.name).toBe('Bilal');
  });

  it('moves everybody with an outcome out of the active queue', () => {
    // A driver reads the top of this list twenty times and the bottom once. Boarded passengers
    // sitting among the people still waiting push the next pickup further down with every stop.
    const groups = groupNames(
      inRouteOrder(
        passenger({ id: 'a', name: 'Aisha', status: 'Boarded' }),
        passenger({ id: 'b', name: 'Bilal', status: 'DroppedOff' }),
        passenger({ id: 'c', name: 'Carla', status: 'NoShow' }),
        passenger({ id: 'd', name: 'Dalia', status: 'Expected' }),
      ),
    );

    expect(groups['next']).toEqual(['Dalia']);
    expect(groups['handled']).toEqual(['Aisha', 'Bilal', 'Carla']);
    expect(groups['upcoming']).toBeUndefined();
  });

  it('never leaves a skipped passenger among the people still expected', () => {
    // The failure this prevents: the driver waits at a kerb for somebody who told the operator days
    // ago that they were not coming.
    const groups = groupNames(
      inRouteOrder(
        passenger({ id: 'a', name: 'Aisha', status: 'Skipped' }),
        passenger({ id: 'b', name: 'Bilal', status: 'Expected' }),
      ),
    );

    expect(groups['next']).toEqual(['Bilal']);
    expect(groups['handled']).toEqual(['Aisha']);
  });

  it('treats a cancelled place as settled too', () => {
    const groups = groupNames(
      inRouteOrder(
        passenger({ id: 'a', name: 'Aisha', status: 'Cancelled' }),
        passenger({ id: 'b', name: 'Bilal', status: 'Expected' }),
      ),
    );

    expect(groups['next']).toEqual(['Bilal']);
  });

  it('does not skip over a blocked passenger to find the next pickup', () => {
    // The bus is still going to that stop. Hiding them produced a "next pickup" pointing two stops
    // ahead while a real person stood at the kerb the bus was pulling away from — what changes for
    // a blocked passenger is the marking, not the ordering.
    const people = inRouteOrder(
      passenger({ id: 'a', name: 'Aisha', sequence: 1, accessState: 'Blocked' }),
      passenger({ id: 'b', name: 'Bilal', sequence: 2 }),
    );

    expect(nextPassenger(people)?.name).toBe('Aisha');
    expect(isNotToBeCarried(people[0]!)).toBe(true);
    expect(isNotToBeCarried(people[1]!)).toBe(false);
  });

  it('does not treat grace period or overdue as a refusal', () => {
    // Only Blocked changes what happens at the kerb. The others are the operator's problem, not the
    // driver's, and a driver who left somebody behind over an overdue invoice would be wrong.
    expect(isNotToBeCarried(passenger({ accessState: 'GracePeriod' }))).toBe(false);
    expect(isNotToBeCarried(passenger({ accessState: 'PaymentOverdue' }))).toBe(false);
  });

  it('drops empty bands rather than drawing headings over nothing', () => {
    expect(manifestGroups([]).length).toBe(0);
    expect(manifestGroups([passenger()]).map((group) => group.key)).toEqual(['next']);
  });

  it('has no next passenger once everybody is accounted for', () => {
    const people = inRouteOrder(
      passenger({ id: 'a', status: 'Boarded' }),
      passenger({ id: 'b', status: 'NoShow' }),
    );

    expect(nextPassenger(people)).toBeNull();
    expect(manifestGroups(people).map((group) => group.key)).toEqual(['handled']);
  });
});
