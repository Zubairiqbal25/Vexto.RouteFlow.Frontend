import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { OperatorManifestPassenger } from '@vexto/models';
import { isAccessBlocked } from '@vexto/models';
import { VxAvatar, VxEmptyState, VxIcon, VxStatusBadge } from '@vexto/ui';
import { formatTime } from '@vexto/utilities';

/** What the operator asked to record against a passenger. */
export type ManifestAction = 'board' | 'no-show' | 'drop-off';

export interface ManifestRequest {
  readonly tripPassengerId: string;
  readonly action: ManifestAction;
}

/**
 * Who is on the trip, how it is going for them, and whether they may travel at all.
 *
 * Compact operational rows, ordered by stop sequence — which is the order the driver meets them and
 * therefore the order a dispatcher reads them in. Sorting by name would be alphabetical trivia
 * about a list whose whole meaning is its sequence.
 *
 * **The access badge is the point of this version.** Until the manifest carried it, a dispatcher
 * fielding "the bus did not stop for me" had no way to see that the passenger was blocked: the
 * block was real, it was having an effect at the kerb, and the only screen that showed it was the
 * one in the driver's cab. The badge appears only when there is something to say — a manifest where
 * everybody is in good standing is a manifest with no access badges on it at all, so the one row
 * that matters is the one thing that stands out.
 *
 * **There is no money on this row, and there will not be.** No amount, no due date, no invoice
 * number. A trip manifest is an operational surface read by every shift supervisor who opens a
 * trip; a dispatcher who also holds Billing permissions reads the figures on the billing screens,
 * where that question belongs.
 *
 * **Correction is offered, not assumed.** The buttons appear only when the host says the current
 * permission and trip state allow a change; the backend is still the authority and its refusal is
 * surfaced verbatim. Reversing an already-recorded outcome is deliberately available while the trip
 * runs, because "boarded the wrong person" is a real thing that happens at 06:05 and the
 * alternative is a manifest everyone knows is wrong.
 */
@Component({
  selector: 'vexto-trip-manifest',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxEmptyState, VxIcon, VxStatusBadge],
  template: `
    @if (passengers().length === 0) {
      <vx-empty-state
        icon="passengers"
        title="No passengers expected for this trip"
        description="Passengers come from the route's assignments at the time the trip was generated."
      />
    } @else {
      <ul class="divide-y divide-line-subtle">
        @for (row of ordered(); track row.id) {
          <li
            class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5"
            [class.bg-danger-soft]="blocked(row)"
          >
            <span
              class="flex size-8 flex-none items-center justify-center rounded-full text-meta
                     font-semibold tabular-nums"
              style="background: var(--vexto-surface-muted); color: var(--vexto-text-secondary)"
              aria-hidden="true"
            >
              {{ row.sequence !== null ? pad(row.sequence) : '—' }}
            </span>

            <!--
              The photo is what a dispatcher on the phone to a driver actually uses: "the one in the
              blue shirt at Cedre Villas" is answered by a face, not by a name.
            -->
            <vx-avatar
              size="sm"
              [name]="row.name"
              [hasPhoto]="row.hasPhoto"
              [photoPath]="photoPath(row)"
            />

            <button
              type="button"
              class="min-w-0 flex-1 text-start"
              (click)="opened.emit(row)"
              [attr.aria-label]="'Open ' + row.name"
            >
              <span class="block truncate font-medium text-ink">{{ row.name }}</span>
              <span class="mt-0.5 flex items-center gap-1.5 truncate text-meta text-ink-muted">
                <vx-icon name="map-pin" [size]="13" />
                {{ row.stop ?? 'No stop recorded' }}
              </span>
            </button>

            <div class="flex flex-none flex-wrap items-center gap-2">
              @if (accessState(row); as state) {
                <vx-status-badge [status]="state" />
              }
              <vx-status-badge [status]="row.status" />
              @if (recordedAt(row); as when) {
                <span class="text-meta tabular-nums text-ink-muted">{{ when }}</span>
              }
            </div>

            @if (editable()) {
              <div class="flex flex-none flex-wrap items-center gap-2">
                @if (row.status === 'Expected') {
                  <button
                    type="button"
                    class="vx-btn vx-btn-secondary vx-btn-sm"
                    (click)="record.emit({ tripPassengerId: row.id, action: 'board' })"
                  >
                    Boarded
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm"
                    (click)="record.emit({ tripPassengerId: row.id, action: 'no-show' })"
                  >
                    No show
                  </button>
                } @else if (row.status === 'Boarded') {
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm"
                    (click)="record.emit({ tripPassengerId: row.id, action: 'drop-off' })"
                  >
                    Dropped off
                  </button>
                }
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class TripManifest {
  readonly passengers = input.required<readonly OperatorManifestPassenger[]>();
  /** True only when the host has confirmed both the permission and the trip state allow it. */
  readonly editable = input(false);

  readonly record = output<ManifestRequest>();
  /** A row was clicked: the host opens the quick-view drawer. */
  readonly opened = output<OperatorManifestPassenger>();

  protected readonly time = formatTime;

  /** Stop order, with anybody unplaced at the end rather than silently first. */
  protected readonly ordered = computed(() =>
    [...this.passengers()].sort((left, right) => {
      const leftSequence = left.sequence === null ? Number.MAX_SAFE_INTEGER : Number(left.sequence);
      const rightSequence =
        right.sequence === null ? Number.MAX_SAFE_INTEGER : Number(right.sequence);

      return leftSequence - rightSequence || left.name.localeCompare(right.name);
    }),
  );

  protected pad(sequence: number | string): string {
    return String(Number(sequence)).padStart(2, '0');
  }

  protected blocked(row: OperatorManifestPassenger): boolean {
    return isAccessBlocked(row.accessState);
  }

  /**
   * The access badge, or null when there is nothing to say.
   *
   * `Active` is the overwhelming majority and means "normal", so badging it would put a pill on
   * every row and leave the one that matters no louder than the rest.
   */
  protected accessState(row: OperatorManifestPassenger): string | null {
    return row.accessState === 'Active' ? null : row.accessState;
  }

  protected photoPath(row: OperatorManifestPassenger): string {
    return `/api/v1/passengers/${row.passengerId}/photo`;
  }

  /** The time the recorded outcome actually happened, when one exists. */
  protected recordedAt(row: OperatorManifestPassenger): string | null {
    const stamp = row.boardedAtUtc ?? row.droppedOffAtUtc ?? row.noShowAtUtc;

    return stamp ? formatTime(stamp) : null;
  }
}
