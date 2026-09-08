import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { OperatorPassengerAccess, PassengerResponse } from '@vexto/models';
import {
  VxAvatar,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatMobile } from '@vexto/utilities';

/**
 * A passenger, as an operator recognises them.
 *
 * **Operational status leads.** The card answers "can this person travel, and are they paid up"
 * before it says anything about a phone number. That ordering is the whole point of the card-first
 * rework: a dispatcher scanning forty passengers is looking for the two who cannot board, and a
 * grid that leads with email addresses buries them.
 *
 * Contact details are secondary metadata at the foot of the card, present because somebody
 * occasionally needs to ring a passenger, and quiet because that is rare.
 *
 * **A blocked passenger is clearly marked and not alarming.** The band is a soft danger tone with a
 * plain sentence, not a red card with a warning triangle: it is a billing state, the passenger is
 * still a customer, and forty of them on one screen would look like a system failure rather than an
 * accounts-receivable problem.
 */
@Component({
  selector: 'vexto-passenger-card',
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
        [name]="passenger().firstName"
        [secondName]="passenger().lastName"
        [hasPhoto]="passenger().hasPhoto"
        [photoPath]="photoPath()"
      />

      <vx-status-badge status [status]="passenger().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Transport access" [value]="accessLabel()" />
        <vx-card-fact label="Mobile" [value]="mobile()" />
      </div>

      @if (blocked()) {
        <p
          class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-meta font-medium"
          style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
        >
          <vx-icon name="ban" [size]="15" />
          Transport access suspended — payment overdue
        </p>
      } @else if (inGrace()) {
        <p
          class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-meta font-medium"
          style="background: var(--vexto-warning-soft); color: var(--vexto-warning-text)"
        >
          <vx-icon name="clock" [size]="15" />
          Payment overdue — {{ graceLabel() }}
        </p>
      }
    </vx-entity-card>
  `,
})
export class PassengerCard {
  readonly passenger = input.required<PassengerResponse>();

  /**
   * Billing state, when the signed-in user is allowed to see it.
   *
   * Null covers two different situations on purpose — still loading, and not permitted — because
   * the card renders identically for both. A dispatcher without `Billing.View` sees a passenger
   * card with no access line at all, rather than a placeholder telling them what they may not know.
   */
  readonly access = input<OperatorPassengerAccess | null>(null);

  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly fullName = computed(
    () => `${this.passenger().firstName} ${this.passenger().lastName}`.trim(),
  );

  protected readonly photoPath = computed(() => `/api/v1/passengers/${this.passenger().id}/photo`);

  protected readonly mobile = computed(() => formatMobile(this.passenger().mobileNumber));

  /** Email is the disambiguator here: two people share a name far more often than an address. */
  protected readonly subtitle = computed(() => this.passenger().email || 'No email on file');

  protected readonly blocked = computed(() => this.access()?.state === 'Blocked');
  protected readonly inGrace = computed(() => this.access()?.state === 'GracePeriod');

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

  protected readonly graceLabel = computed(() => {
    const until = this.access()?.gracePeriodEndsOn;

    return until ? `grace ends ${until}` : 'within grace period';
  });

  protected readonly actions = computed<VxCardAction[]>(() => {
    const passenger = this.passenger();

    return [
      { id: 'edit', label: 'Edit details', icon: 'edit' },
      { id: 'invite', label: 'Invite to app', icon: 'mail' },
      passenger.status === 'Active'
        ? { id: 'deactivate', label: 'Deactivate', icon: 'power', danger: true }
        : { id: 'activate', label: 'Activate', icon: 'check' },
    ];
  });
}
