import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PassengerInvoicesApi, VextoApiError } from '@vexto/api-client';
import type { PassengerInvoice } from '@vexto/models';
import { StripeCheckout } from '@vexto/payments';
import { VxErrorState, VxIcon, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatMoney } from '@vexto/utilities';

/**
 * Where a passenger is in the act of paying.
 *
 * <b>`paid` is only ever reached because the server said so.</b> The provider's component
 * returning without an error moves this to `pending`, never to `paid`: the money has not
 * necessarily arrived, and a screen that said it had would be telling somebody they are square
 * with their operator when they are not. See Backend/docs/payments.md.
 */
type PayState = 'ready' | 'opening' | 'confirming' | 'requiresAction' | 'pending' | 'paid' | 'failed';

/**
 * One invoice, and paying it.
 *
 * Nothing on this page sends an amount. The server reads it from the invoice, which is what stops
 * a 420 invoice being settled for 1 by anybody willing to edit a request.
 */
@Component({
  selector: 'vexto-passenger-invoice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <a class="text-meta text-ink-muted" routerLink="/payments">All invoices</a>

      @if (error(); as message) {
        <vx-error-state
          class="mt-4 block"
          title="We could not load this invoice"
          [message]="message"
          (retry)="load()"
        />
      } @else if (loading()) {
        <vx-skeleton class="mt-4 block" height="12rem" />
      } @else if (invoice(); as bill) {
        <h1 class="mt-1 text-lg font-semibold tracking-tight text-ink">{{ bill.invoiceNumber }}</h1>

        <section class="vx-card mt-4 p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="vx-section-label">Total</p>
              <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
                {{ money(bill.total, bill.currency) }}
              </p>
            </div>
            <vx-status-badge [status]="bill.status" />
          </div>

          <dl class="mt-5 grid grid-cols-2 gap-5">
            <div>
              <dt class="vx-section-label">Billing period</dt>
              <dd class="mt-1 text-body text-ink">
                {{ date(bill.periodStart) }} – {{ date(bill.periodEnd) }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Due</dt>
              <dd class="mt-1 text-body text-ink">{{ date(bill.dueDate) }}</dd>
            </div>
          </dl>

          <div class="mt-5 border-t border-line-subtle pt-4">
            @for (line of bill.items; track line.id) {
              <div class="flex items-baseline justify-between gap-3 py-1">
                <span class="text-body text-ink-secondary">{{ line.description }}</span>
                <span class="text-body text-ink">{{ money(line.amount, bill.currency) }}</span>
              </div>
            }

            <div class="mt-2 flex items-baseline justify-between gap-3 py-1">
              <span class="text-meta text-ink-muted">Subtotal</span>
              <span class="text-meta text-ink-muted">{{ money(bill.subtotal, bill.currency) }}</span>
            </div>

            @if (bill.taxAmount > 0) {
              <div class="flex items-baseline justify-between gap-3 py-1">
                <span class="text-meta text-ink-muted">Tax</span>
                <span class="text-meta text-ink-muted">
                  {{ money(bill.taxAmount, bill.currency) }}
                </span>
              </div>
            }

            <div class="mt-2 flex items-baseline justify-between gap-3 border-t border-line-subtle pt-3">
              <span class="text-body font-semibold text-ink">Total</span>
              <span class="text-body font-semibold text-ink">
                {{ money(bill.total, bill.currency) }}
              </span>
            </div>

            @if (bill.refundedAmount > 0) {
              <div class="flex items-baseline justify-between gap-3 py-1">
                <span class="text-meta text-ink-muted">Refunded</span>
                <span class="text-meta text-ink-muted">
                  −{{ money(bill.refundedAmount, bill.currency) }}
                </span>
              </div>
            }
          </div>
        </section>

        @switch (payState()) {
          @case ('paid') {
            <div class="vx-card mt-4 flex items-start gap-3 p-5">
              <vx-icon name="check-circle" [size]="20" class="mt-0.5 flex-none text-primary" />
              <div>
                <p class="text-body font-medium text-ink">Paid</p>
                <p class="mt-1 text-meta text-ink-muted">
                  Your operator has received this payment. Nothing more to do.
                </p>
              </div>
            </div>
          }

          @case ('pending') {
            <!--
              The honest state, and the reason this screen exists. The provider took the payment
              and has not yet confirmed it to Vexto. Saying "paid" here would be believing the
              browser about somebody's money.
            -->
            <div class="vx-card mt-4 flex items-start gap-3 p-5">
              <vx-icon name="live" [size]="20" class="mt-0.5 flex-none text-ink-muted" />
              <div>
                <p class="text-body font-medium text-ink">Payment being confirmed</p>
                <p class="mt-1 text-meta text-ink-muted">
                  Your bank has accepted it. This usually takes a few seconds — you can leave this
                  screen and it will update.
                </p>
              </div>
            </div>
          }

          @case ('requiresAction') {
            <div class="vx-card mt-4 p-5">
              <p class="text-body font-medium text-ink">Your bank needs to check something</p>
              <p class="mt-1 text-meta text-ink-muted">
                Follow the steps your bank shows, then come back here.
              </p>
            </div>
          }

          @case ('failed') {
            <div class="vx-card mt-4 p-5">
              <p class="text-body font-medium text-ink">Payment not taken</p>
              <p class="mt-1 text-meta text-ink-muted">{{ failure() }}</p>
              <button
                type="button"
                class="vx-btn vx-btn-secondary vx-btn-touch mt-4 w-full"
                (click)="startPayment()"
              >
                Try again
              </button>
            </div>
          }

          @default {
            @if (payable(bill)) {
              <div class="mt-4">
                <!--
                  The provider's own component mounts here. Vexto never renders a card field: the
                  number and CVC are typed into the provider's iframe and never touch this app.
                -->
                <div #sheet [hidden]="payState() !== 'confirming'" class="vx-card p-5"></div>

                @if (payState() === 'confirming') {
                  <button
                    type="button"
                    class="vx-btn vx-btn-primary vx-btn-touch mt-4 w-full"
                    [disabled]="submitting()"
                    (click)="confirm()"
                  >
                    {{ submitting() ? 'Paying…' : 'Pay ' + money(bill.total, bill.currency) }}
                  </button>
                } @else if (checkout.isConfigured) {
                  <button
                    type="button"
                    class="vx-btn vx-btn-primary vx-btn-touch w-full"
                    [disabled]="payState() === 'opening'"
                    (click)="startPayment()"
                  >
                    {{ payState() === 'opening' ? 'Opening…' : 'Pay now' }}
                  </button>
                } @else {
                  <!--
                    No publishable key, so there is no payment sheet to open. An inert Pay button
                    would invite people to try and conclude the app is broken.
                  -->
                  <p class="text-meta text-ink-muted">
                    Online payment is not available for this operator. Contact them to arrange
                    payment.
                  </p>
                }
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class PassengerInvoiceDetailPage {
  private readonly api = inject(PassengerInvoicesApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly checkout = inject(StripeCheckout);

  protected readonly date = formatDate;
  protected readonly money = formatMoney;

  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  private readonly invoiceId = this.route.snapshot.paramMap.get('invoiceId') ?? '';

  private paymentId: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  protected readonly invoice = signal<PassengerInvoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly failure = signal('');

  protected readonly payState = signal<PayState>('ready');

  protected readonly isSettled = computed(() => {
    const status = this.invoice()?.status;

    return status === 'Paid' || status === 'Refunded' || status === 'PartiallyRefunded';
  });

  constructor() {
    this.load();

    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.invoice(this.invoiceId).subscribe({
      next: (invoice) => {
        this.invoice.set(invoice);
        this.loading.set(false);

        if (invoice.status === 'Paid' || invoice.status === 'Refunded'
          || invoice.status === 'PartiallyRefunded') {
          this.payState.set('paid');
          this.stopPolling();
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);

        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not reach the server.',
        );
      },
    });
  }

  protected payable(invoice: PassengerInvoice): boolean {
    return invoice.status === 'Open' || invoice.status === 'Overdue';
  }

  /** Asks the server to start a payment, then mounts the provider's sheet with what it returns. */
  protected startPayment(): void {
    if (this.payState() === 'opening') {
      return;
    }

    this.payState.set('opening');
    this.failure.set('');

    // No body. The amount is the server's to decide, from the invoice it just loaded.
    this.api.startPayment(this.invoiceId).subscribe({
      next: async (intent) => {
        this.paymentId = intent.paymentId;

        if (!intent.clientSecret) {
          this.payState.set('failed');
          this.failure.set('This payment could not be started. Try again shortly.');

          return;
        }

        this.payState.set('confirming');

        // The container only exists once the state above has rendered it.
        await Promise.resolve();

        const container = this.sheet()?.nativeElement;

        const mounted = container
          && (await this.checkout.mountAsync(container, intent.clientSecret));

        if (!mounted) {
          this.payState.set('failed');
          this.failure.set('The payment form could not be opened. Try again shortly.');
        }
      },
      error: (error: unknown) => {
        this.payState.set('failed');

        // The server refuses with a readable reason — the operator is not set up, the invoice is
        // already paid — and each of those is more useful than a generic message.
        this.failure.set(
          error instanceof VextoApiError
            ? error.message
            : 'This payment could not be started. Try again shortly.',
        );
      },
    });
  }

  protected async confirm(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const outcome = await this.checkout.confirmAsync(window.location.href);

    this.submitting.set(false);

    switch (outcome.kind) {
      case 'confirmed':
      case 'requiresAction':
        // Pending, never paid. The provider accepted it; whether the money arrived is a question
        // only the server can answer, and the poll below is how it is asked.
        this.checkout.unmount();
        this.payState.set(outcome.kind === 'confirmed' ? 'pending' : 'requiresAction');
        this.startPolling();
        break;

      case 'failed':
        this.payState.set('failed');
        this.failure.set(outcome.message);
        break;

      default:
        this.payState.set('failed');
        this.failure.set('The payment could not be completed. Try again shortly.');
        break;
    }
  }

  /**
   * Asks the server what actually happened, until it knows.
   *
   * Settlement is asynchronous: the provider confirms to Vexto on its own schedule, and the app
   * cannot know when. Polling the payment is what turns "pending" into "paid" — and the endpoint
   * behind it asks the provider directly if no notification has arrived, so a missed webhook does
   * not leave a passenger staring at a spinner.
   */
  private startPolling(): void {
    this.stopPolling();

    let attempts = 0;

    this.poll = setInterval(() => {
      attempts++;

      if (!this.paymentId || attempts > 20) {
        // Twenty attempts at three seconds is a minute. Past that it is not a slow confirmation,
        // it is something wrong, and the passenger is better served by the invoice list than by
        // an indefinite spinner.
        this.stopPolling();

        return;
      }

      this.api.payment(this.paymentId).subscribe({
        next: (payment) => {
          if (payment.status === 'Succeeded') {
            this.stopPolling();
            this.payState.set('paid');
            this.load();
          } else if (payment.status === 'Failed') {
            this.stopPolling();
            this.payState.set('failed');
            this.failure.set('Your bank did not complete the payment. You can try again.');
          }
        },

        // A failed poll is not worth telling anybody about — the next one is three seconds away.
        error: () => undefined,
      });
    }, 3000);
  }

  private stopPolling(): void {
    if (this.poll !== null) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}
