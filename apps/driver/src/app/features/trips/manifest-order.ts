import type { DriverManifestPassenger } from '@vexto/models';
import { isAccessBlocked } from '@vexto/models';

/** One band of the driver's manifest. */
export interface ManifestGroup {
  readonly key: 'next' | 'upcoming' | 'handled';
  readonly label: string;
  readonly passengers: readonly DriverManifestPassenger[];
}

/**
 * The order a driver works a manifest in.
 *
 * **A driver reads the top of this list twenty times and the bottom once.** Keeping boarded and
 * no-show passengers in sequence order among the people still waiting means the next pickup drifts
 * further down the screen with every stop — which is exactly backwards. So the list is banded:
 * the one person next, everyone still to come, then everything already settled.
 *
 * **Anybody with an outcome leaves the active queue.** Boarded, dropped off, no-show, skipped and
 * cancelled all move to "Handled". A skipped passenger in particular must never sit among the
 * people still expected: the driver would wait at a kerb for somebody who told the operator days
 * ago that they were not coming.
 *
 * **A blocked passenger is not skipped over.** They stay in the queue, in sequence, and can be the
 * next person shown — because the bus is still going to that stop, and the driver needs to arrive
 * knowing the answer is no. Hiding them produced the opposite: a "next pickup" pointing two stops
 * ahead while a real person stood at the kerb the bus was pulling away from. What changes is the
 * marking, not the ordering.
 *
 * Pure functions over an array, so the ordering has unit tests rather than a rendered screen.
 */
export function nextPassenger(
  passengers: readonly DriverManifestPassenger[],
): DriverManifestPassenger | null {
  return passengers.find((passenger) => passenger.status === 'Expected') ?? null;
}

export function manifestGroups(
  passengers: readonly DriverManifestPassenger[],
): readonly ManifestGroup[] {
  const outstanding = passengers.filter((passenger) => passenger.status === 'Expected');
  const handled = passengers.filter((passenger) => passenger.status !== 'Expected');
  const next = nextPassenger(passengers);

  return (
    [
      { key: 'next', label: 'Next', passengers: next ? [next] : [] },
      {
        key: 'upcoming',
        label: 'Upcoming',
        passengers: outstanding.filter((passenger) => passenger.id !== next?.id),
      },
      { key: 'handled', label: 'Handled', passengers: handled },
    ] satisfies ManifestGroup[]
  ).filter((group) => group.passengers.length > 0);
}

/** Whether the driver should carry this person. The one billing fact the manifest exposes. */
export function isNotToBeCarried(passenger: DriverManifestPassenger): boolean {
  return isAccessBlocked(passenger.accessState);
}
