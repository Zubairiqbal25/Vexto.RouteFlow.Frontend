import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DriverResponse } from '@vexto/models';
import {
  VxAvatar,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatMobile } from '@vexto/utilities';

/** A licence inside this window is worth warning about; past it, it is a blocker. */
const EXPIRY_WARNING_DAYS = 30;

/**
 * A driver, as a dispatcher assigning tomorrow's roster reads them.
 *
 * **The licence is the operational fact that matters.** A driver whose licence lapses cannot be
 * rostered, and finding that out on the morning of the trip is the failure this card exists to
 * prevent — so an expiry inside thirty days is a visible warning on the card itself rather than a
 * date somebody has to compare against today in their head.
 *
 * Whether they are currently driving is the other lead fact; contact details are secondary.
 */
@Component({
  selector: 'vexto-driver-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="fullName()"
      [subtitle]="subtitle()"
      [actions]="actions()"
      [selected]="selected()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <vx-avatar
        media
        size="lg"
        [name]="driver().firstName"
        [secondName]="driver().lastName"
        [hasPhoto]="driver().hasPhoto"
        [photoPath]="photoPath()"
        [status]="dotStatus()"
      />

      <vx-status-badge status [status]="driver().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Licence" [value]="driver().licenseNumber" />
        <vx-card-fact label="Mobile" [value]="mobile()" />
      </div>

      @if (expiry(); as warning) {
        <p
          class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-meta font-medium"
          [style.background]="'var(--vexto-' + warning.tone + '-soft)'"
          [style.color]="'var(--vexto-' + warning.tone + '-text)'"
        >
          <vx-icon [name]="warning.tone === 'danger' ? 'ban' : 'alert'" [size]="15" />
          {{ warning.label }}
        </p>
      } @else {
        <p class="mt-3 text-meta text-ink-muted">
          Licence valid until {{ expiryDate() }}
        </p>
      }
    </vx-entity-card>
  `,
})
export class DriverCard {
  readonly driver = input.required<DriverResponse>();
  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly fullName = computed(
    () => `${this.driver().firstName} ${this.driver().lastName}`.trim(),
  );

  protected readonly photoPath = computed(() => `/api/v1/drivers/${this.driver().id}/photo`);
  protected readonly mobile = computed(() => formatMobile(this.driver().mobileNumber));
  protected readonly expiryDate = computed(() => formatDate(this.driver().licenseExpiryDate));

  protected readonly subtitle = computed(() => this.driver().email || 'No email on file');

  /**
   * The dot on the avatar. Decorative only — the status badge beside the name carries the same
   * information in words, which is what a screen reader and a colour-blind dispatcher read.
   */
  protected readonly dotStatus = computed(() => {
    const status = this.driver().status;

    if (status === 'Active') {
      return 'online' as const;
    }

    return status === 'Suspended' ? ('danger' as const) : ('offline' as const);
  });

  /**
   * Null when the licence is comfortably valid, so the card shows a quiet line instead of a band.
   * A warning on every card is a warning nobody reads.
   */
  protected readonly expiry = computed<{ tone: 'danger' | 'warning'; label: string } | null>(() => {
    const expiry = new Date(`${this.driver().licenseExpiryDate}T00:00:00`);

    if (Number.isNaN(expiry.getTime())) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

    if (days < 0) {
      return { tone: 'danger', label: `Licence expired ${this.expiryDate()}` };
    }

    if (days === 0) {
      return { tone: 'danger', label: 'Licence expires today' };
    }

    return days <= EXPIRY_WARNING_DAYS
      ? { tone: 'warning', label: `Licence expires in ${days} ${days === 1 ? 'day' : 'days'}` }
      : null;
  });

  protected readonly actions = computed<VxCardAction[]>(() => {
    const driver = this.driver();

    return [
      { id: 'edit', label: 'Edit details', icon: 'edit' },
      { id: 'invite', label: 'Invite to driver app', icon: 'mail' },
      driver.status === 'Active'
        ? { id: 'deactivate', label: 'Deactivate', icon: 'power', danger: true }
        : { id: 'activate', label: 'Activate', icon: 'check' },
    ];
  });
}
