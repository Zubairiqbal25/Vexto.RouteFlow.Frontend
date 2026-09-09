import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OperatorManifestPassenger } from '@vexto/models';
import { isAccessBlocked, statusLabel } from '@vexto/models';
import { VxAttentionNote, VxAvatar, VxCardFact, VxDrawer, VxStatusBadge } from '@vexto/ui';
import { formatTime } from '@vexto/utilities';

/**
 * One manifest row, opened.
 *
 * A quick view rather than a page, for the same reason as every other drawer in the operator app: a
 * dispatcher checking who somebody is and why the bus did not stop for them wants an answer, not a
 * navigation. The full passenger record — contact details, subscriptions, invoices — stays one
 * click away on its own page, so nothing here is a second place the same fields are maintained.
 *
 * **It stays inside the manifest's own privacy boundary.** The access state is here because the
 * operator is asking an operational question; the amount behind it is not, and neither is a due
 * date or an invoice number. Somebody who needs the figures opens the passenger's billing screens,
 * where reading them is what the screen is for.
 */
@Component({
  selector: 'vexto-trip-passenger-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxAttentionNote, VxAvatar, VxCardFact, VxDrawer, VxStatusBadge],
  template: `
    <vx-drawer
      [open]="open()"
      [title]="passenger()?.name ?? 'Passenger'"
      subtitle="On this trip"
      (closed)="dismissed.emit()"
    >
      @if (passenger(); as row) {
        <div class="flex flex-col gap-5">
          <div class="flex items-center gap-3.5">
            <vx-avatar
              size="lg"
              [name]="row.name"
              [hasPhoto]="row.hasPhoto"
              [photoPath]="photoPath()"
            />
            <div class="min-w-0">
              <p class="truncate text-base font-semibold text-ink">{{ row.name }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <vx-status-badge [status]="row.status" />
                <vx-status-badge [status]="row.accessState" />
              </div>
            </div>
          </div>

          @if (blocked()) {
            <vx-attention-note level="critical">
              This passenger is blocked from travel. They stay on the manifest so the driver knows
              not to wait for them.
            </vx-attention-note>
          }

          <dl class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Pickup" [value]="row.stop ?? 'No stop recorded'" />
            <vx-card-fact
              label="Sequence"
              [value]="row.sequence === null ? '—' : pad(row.sequence)"
            />
            <vx-card-fact label="Attendance" [value]="attendanceLabel()" />
            <vx-card-fact label="Recorded" [value]="recordedAt() ?? 'Not yet'" />
          </dl>
        </div>
      }

      <div footer class="flex justify-end">
        @if (passenger(); as row) {
          <a class="vx-btn vx-btn-secondary" [routerLink]="['/passengers']" [queryParams]="{ search: row.name }">
            View full details
          </a>
        }
      </div>
    </vx-drawer>
  `,
})
export class TripPassengerDrawer {
  readonly open = input(false);
  readonly passenger = input<OperatorManifestPassenger | null>(null);

  readonly dismissed = output<void>();

  protected readonly blocked = computed(() => isAccessBlocked(this.passenger()?.accessState));

  protected readonly photoPath = computed(() => {
    const row = this.passenger();

    return row ? `/api/v1/passengers/${row.passengerId}/photo` : null;
  });

  /**
   * Humanised through the shared map, so the drawer says "Dropped off" where the row beside it
   * does. Printing the enum name was the one place in the product a raw `DroppedOff` reached a
   * screen.
   */
  protected readonly attendanceLabel = computed(() => {
    const status = this.passenger()?.status;

    return status ? statusLabel(status) : '—';
  });

  protected readonly recordedAt = computed(() => {
    const row = this.passenger();

    if (!row) {
      return null;
    }

    const stamp = row.boardedAtUtc ?? row.droppedOffAtUtc ?? row.noShowAtUtc;

    return stamp ? formatTime(stamp) : null;
  });

  protected pad(sequence: number | string): string {
    return String(Number(sequence)).padStart(2, '0');
  }
}
