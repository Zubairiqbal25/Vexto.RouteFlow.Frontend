import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PassengerAccessStatus } from '@vexto/models';
import { VxIcon } from '@vexto/ui';
import { formatDate, formatMoney } from '@vexto/utilities';

interface AccessPresentation {
  readonly tone: 'success' | 'warning' | 'danger' | 'info';
  readonly icon: 'check-circle' | 'clock' | 'alert' | 'ban';
  readonly heading: string;
  readonly detail: string;
  readonly showPay: boolean;
  /** Full-width and prominent, rather than a quiet line in a stack of cards. */
  readonly prominent: boolean;
}

/**
 * The passenger's billing state, in the four shapes it can take.
 *
 * **This is never a 403 page.** A passenger whose transport access is suspended can still sign in,
 * still read this card and still pay — because this app is the only place they can settle the thing
 * that suspended them. Locking them out would leave no route back to travelling, which is why the
 * API keeps billing reachable while blocked and why this component leads with **Pay Now** rather
 * than with an apology.
 *
 * The wording is deliberately plain and the tone is deliberately restrained: being behind on a
 * payment is an ordinary situation, and a red screen with a warning triangle treats a customer like
 * an intruder.
 */
@Component({
  selector: 'vexto-access-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxIcon],
  template: `
    @if (view(); as state) {
      <section
        class="vx-card overflow-hidden"
        [class.shadow-raised]="state.prominent"
        [style.border-color]="state.prominent ? 'var(--vexto-' + state.tone + ')' : null"
        role="status"
      >
        <div
          class="flex items-start gap-3 px-5 py-4"
          [style.background]="'var(--vexto-' + state.tone + '-soft)'"
          [style.color]="'var(--vexto-' + state.tone + '-text)'"
        >
          <vx-icon [name]="state.icon" [size]="20" />
          <div class="min-w-0 flex-1">
            <p class="text-[0.9375rem] font-semibold">{{ state.heading }}</p>
            <p class="mt-0.5 text-meta opacity-90">{{ state.detail }}</p>
          </div>
        </div>

        @if (state.showPay) {
          <div class="px-5 py-4">
            @if (amount(); as due) {
              <p class="text-[1.75rem] font-semibold leading-9 tracking-tight text-ink">{{ due }}</p>
              <p class="mt-0.5 text-meta text-ink-muted">Outstanding balance</p>
            }

            <a class="vx-btn vx-btn-primary vx-btn-touch mt-4 w-full" routerLink="/billing">
              Pay now
            </a>

            @if (operator(); as name) {
              <p class="mt-3 text-center text-meta text-ink-muted">
                Questions? Contact {{ name }}.
              </p>
            }
          </div>
        }
      </section>
    }
  `,
})
export class PassengerAccessCard {
  readonly status = input<PassengerAccessStatus | null>(null);

  /** Shown to a blocked passenger so they know who to call. Their operator, not Vexto. */
  readonly operator = input<string | null>(null);

  protected readonly amount = computed(() => {
    const status = this.status();

    return status && status.amountOutstanding > 0
      ? formatMoney(status.amountOutstanding, status.currency ?? 'AED')
      : null;
  });

  protected readonly view = computed<AccessPresentation | null>(() => {
    const status = this.status();

    if (!status) {
      return null;
    }

    switch (status.state) {
      case 'Active':
        return {
          tone: 'success',
          icon: 'check-circle',
          heading: 'Payments up to date',
          detail: 'Your transport is active. Nothing to pay right now.',
          showPay: false,
          prominent: false,
        };

      case 'GracePeriod':
        return {
          tone: 'warning',
          icon: 'clock',
          heading: 'Payment overdue',
          detail: status.gracePeriodEndsOn
            ? `You can keep travelling until ${formatDate(status.gracePeriodEndsOn)}.`
            : 'You can keep travelling for now. Please settle your balance.',
          showPay: true,
          prominent: false,
        };

      case 'PaymentOverdue':
        return {
          tone: 'warning',
          icon: 'alert',
          heading: 'Payment overdue',
          detail: status.earliestDueDate
            ? `Due since ${formatDate(status.earliestDueDate)}. You are still able to travel.`
            : 'Your balance is overdue. You are still able to travel.',
          showPay: true,
          prominent: false,
        };

      case 'Blocked':
      default:
        return {
          tone: 'danger',
          icon: 'ban',
          heading: 'Transport access suspended',
          detail:
            'Your transport payment is overdue. Settle the balance below and your access resumes straight away.',
          showPay: true,
          prominent: true,
        };
    }
  });
}
