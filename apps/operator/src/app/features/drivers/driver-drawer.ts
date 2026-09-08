import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DriverResponse } from '@vexto/models';
import {
  VxAttentionNote,
  VxAvatar,
  VxCardFact,
  VxDrawer,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatMobile } from '@vexto/utilities';

const EXPIRY_WARNING_DAYS = 30;

/**
 * A driver, inspected without leaving the list.
 *
 * Answers the roster question — can I put this person on tomorrow's route — which is licence
 * validity, current status, and whether they can sign in to the driver app at all. An unlinked
 * account is worth surfacing here: a driver with no login cannot record attendance, and finding
 * that out at 6am is the failure this prevents.
 *
 * Costs no request; the list row is already loaded.
 */
@Component({
  selector: 'vexto-driver-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxAvatar, VxCardFact, VxDrawer, VxIcon, VxStatusBadge],
  template: `
    <vx-drawer
      [open]="driver() !== null"
      [title]="fullName()"
      [subtitle]="driver()?.email ?? 'No email on file'"
      (closed)="closed.emit()"
    >
      @if (driver(); as person) {
        <div class="flex flex-col gap-5">
          <div class="flex items-center gap-4">
            <vx-avatar
              size="xl"
              [name]="person.firstName"
              [secondName]="person.lastName"
              [hasPhoto]="person.hasPhoto"
              [photoPath]="photoPath()"
              [status]="person.status === 'Active' ? 'online' : 'offline'"
            />
            <div class="min-w-0">
              <vx-status-badge [status]="person.status" />
              <p class="mt-2 truncate text-meta text-ink-muted">Added {{ added() }}</p>
            </div>
          </div>

          @if (licence(); as note) {
            <vx-attention-note [level]="note.level">
              <vx-icon [name]="note.icon" [size]="15" />
              {{ note.label }}
            </vx-attention-note>
          }

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Licence" [value]="person.licenseNumber" />
            <vx-card-fact label="Valid until" [value]="expiry()" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Mobile" [value]="mobile()" />
            <vx-card-fact label="Driver app" [value]="appAccess()" />
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
          (click)="driver() && edit.emit(driver()!)"
        >
          Edit driver
        </button>
      </div>
    </vx-drawer>
  `,
})
export class DriverDrawer {
  readonly driver = input<DriverResponse | null>(null);

  readonly closed = output<void>();
  readonly edit = output<DriverResponse>();

  protected readonly fullName = computed(() => {
    const person = this.driver();

    return person ? `${person.firstName} ${person.lastName}`.trim() : '';
  });

  protected readonly photoPath = computed(() => {
    const id = this.driver()?.id;

    return id ? `/api/v1/drivers/${id}/photo` : null;
  });

  protected readonly mobile = computed(() =>
    this.driver() ? formatMobile(this.driver()!.mobileNumber) : '—',
  );

  protected readonly expiry = computed(() =>
    this.driver() ? formatDate(this.driver()!.licenseExpiryDate) : '—',
  );

  protected readonly added = computed(() =>
    this.driver() ? formatDate(this.driver()!.createdAtUtc) : '—',
  );

  /** Whether they can actually sign in. A rostered driver with no account records no attendance. */
  protected readonly appAccess = computed(() =>
    this.driver()?.userId ? 'Has a login' : 'Not invited yet',
  );

  protected readonly licence = computed<{
    level: 'warning' | 'critical';
    icon: 'ban' | 'alert';
    label: string;
  } | null>(() => {
    const driver = this.driver();

    if (!driver) {
      return null;
    }

    const expiry = new Date(`${driver.licenseExpiryDate}T00:00:00`);

    if (Number.isNaN(expiry.getTime())) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

    if (days < 0) {
      return {
        level: 'critical',
        icon: 'ban',
        label: `Licence expired ${formatDate(driver.licenseExpiryDate)} — do not roster`,
      };
    }

    return days <= EXPIRY_WARNING_DAYS
      ? {
          level: 'warning',
          icon: 'alert',
          label:
            days === 0
              ? 'Licence expires today'
              : `Licence expires in ${days} ${days === 1 ? 'day' : 'days'}`,
        }
      : null;
  });
}
