import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { OperatorPassengerAccess, PassengerResponse } from '@vexto/models';
import {
  VxAttentionNote,
  VxAvatar,
  VxCardFact,
  VxDrawer,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatMoney, formatMobile } from '@vexto/utilities';

/**
 * A passenger, inspected without leaving the list.
 *
 * **Not a second passenger page.** It answers the questions a dispatcher asks about somebody they
 * have just spotted on a grid — can they travel, are they paid up, how do I reach them — and hands
 * off to the full record for everything else. Duplicating every field here would create a screen
 * that has to be kept in step with the form.
 *
 * It costs no request: the list row and the batched access status are already loaded.
 *
 * The outstanding amount appears here and never on the card. A card sits in a grid somebody may be
 * showing on a projector; a drawer is opened deliberately, by one person, about one passenger.
 */
@Component({
  selector: 'vexto-passenger-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxAvatar, VxCardFact, VxDrawer, VxIcon, VxStatusBadge],
  template: `
    <vx-drawer
      [open]="passenger() !== null"
      [title]="fullName()"
      [subtitle]="passenger()?.email ?? 'No email on file'"
      (closed)="closed.emit()"
    >
      @if (passenger(); as person) {
        <div class="flex flex-col gap-5">
          <div class="flex items-center gap-4">
            <vx-avatar
              size="xl"
              [name]="person.firstName"
              [secondName]="person.lastName"
              [hasPhoto]="person.hasPhoto"
              [photoPath]="photoPath()"
            />
            <div class="min-w-0">
              <vx-status-badge [status]="person.status" />
              <p class="mt-2 truncate text-meta text-ink-muted">
                Added {{ added() }}
              </p>
            </div>
          </div>

          @if (accessNote(); as note) {
            <vx-attention-note [level]="note.level">
              <vx-icon [name]="note.icon" [size]="15" />
              {{ note.label }}
            </vx-attention-note>
          }

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Transport access" [value]="accessLabel()" />
            <vx-card-fact label="Outstanding" [value]="outstanding()" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Mobile" [value]="mobile()" />
            <vx-card-fact label="Email" [value]="person.email ?? '—'" />
          </div>

          @if (person.notes; as notes) {
            <div>
              <p class="vx-section-label mb-1">Operator notes</p>
              <p class="text-body text-ink-secondary">{{ notes }}</p>
            </div>
          }
        </div>
      }

      <div footer class="flex gap-2">
        <button type="button" class="vx-btn vx-btn-secondary flex-1" (click)="closed.emit()">
          Close
        </button>
        <button
          type="button"
          class="vx-btn vx-btn-primary flex-1"
          (click)="passenger() && edit.emit(passenger()!)"
        >
          Edit passenger
        </button>
      </div>
    </vx-drawer>
  `,
})
export class PassengerDrawer {
  readonly passenger = input<PassengerResponse | null>(null);
  readonly access = input<OperatorPassengerAccess | null>(null);

  readonly closed = output<void>();
  readonly edit = output<PassengerResponse>();

  protected readonly fullName = computed(() => {
    const person = this.passenger();

    return person ? `${person.firstName} ${person.lastName}`.trim() : '';
  });

  protected readonly photoPath = computed(() => {
    const id = this.passenger()?.id;

    return id ? `/api/v1/passengers/${id}/photo` : null;
  });

  protected readonly mobile = computed(() =>
    this.passenger() ? formatMobile(this.passenger()!.mobileNumber) : '—',
  );

  protected readonly added = computed(() =>
    this.passenger() ? formatDate(this.passenger()!.createdAtUtc) : '—',
  );

  protected readonly accessLabel = computed(() => {
    const access = this.access();

    if (!access) {
      return '—';
    }

    return {
      Active: 'Active',
      GracePeriod: 'In grace period',
      PaymentOverdue: 'Payment overdue',
      Blocked: 'Blocked',
    }[access.state] as string;
  });

  protected readonly outstanding = computed(() => {
    const access = this.access();

    if (!access || access.amountOutstanding <= 0) {
      return 'Nothing owed';
    }

    return formatMoney(access.amountOutstanding, access.currency ?? 'AED');
  });

  protected readonly accessNote = computed<{
    level: 'warning' | 'critical';
    icon: 'ban' | 'clock';
    label: string;
  } | null>(() => {
    const access = this.access();

    if (access?.state === 'Blocked') {
      return {
        level: 'critical',
        icon: 'ban',
        label: 'Transport access suspended — this passenger will not be picked up',
      };
    }

    if (access?.state === 'GracePeriod') {
      return {
        level: 'warning',
        icon: 'clock',
        label: access.gracePeriodEndsOn
          ? `Payment overdue — grace ends ${formatDate(access.gracePeriodEndsOn)}`
          : 'Payment overdue — still within the grace period',
      };
    }

    return null;
  });
}
