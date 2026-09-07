import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PassengerInvoicesApi, VextoApiError } from '@vexto/api-client';
import type { PassengerInvoice } from '@vexto/models';
import { VxEmptyState, VxErrorState, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatMoney } from '@vexto/utilities';

/**
 * A passenger's own bills.
 *
 * Open first, because that is the reason somebody opens this screen. Paid invoices are kept below
 * as a receipt — the commonest support question after "how much do I owe" is "did my payment go
 * through", and this answers both.
 */
@Component({
  selector: 'vexto-passenger-invoices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxEmptyState, VxErrorState, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <h1 class="text-lg font-semibold tracking-tight text-ink">Payments</h1>

      @if (error(); as message) {
        <vx-error-state
          class="mt-4 block"
          title="We could not load your invoices"
          [message]="message"
          (retry)="load()"
        />
      } @else if (loading()) {
        <vx-skeleton class="mt-4 block" height="8rem" />
      } @else {
        @if (outstanding(); as due) {
          @if (due.length > 0) {
            <section class="vx-card mt-4 overflow-hidden">
              <div class="border-b border-line-subtle px-5 py-4">
                <p class="vx-section-label">Due now</p>
                <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
                  {{ money(totalDue(), due[0].currency) }}
                </p>
              </div>

              <ul>
                @for (invoice of due; track invoice.id) {
                  <li class="border-b border-line-subtle last:border-b-0">
                    <a
                      class="flex items-center justify-between gap-3 px-5 py-4"
                      [routerLink]="['/payments', invoice.id]"
                    >
                      <span class="min-w-0">
                        <span class="block truncate text-body font-medium text-ink">
                          {{ invoice.invoiceNumber }}
                        </span>
                        <span class="mt-0.5 block text-meta text-ink-muted">
                          Due {{ date(invoice.dueDate) }}
                        </span>
                      </span>

                      <span class="flex flex-none items-center gap-3">
                        <span class="text-body font-semibold text-ink">
                          {{ money(invoice.total, invoice.currency) }}
                        </span>
                        <vx-status-badge [status]="invoice.status" />
                      </span>
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        }

        @if (settled().length > 0) {
          <p class="vx-section-label mt-6">Earlier</p>

          <section class="vx-card mt-2 overflow-hidden">
            <ul>
              @for (invoice of settled(); track invoice.id) {
                <li class="border-b border-line-subtle last:border-b-0">
                  <a
                    class="flex items-center justify-between gap-3 px-5 py-4"
                    [routerLink]="['/payments', invoice.id]"
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-body text-ink">
                        {{ invoice.invoiceNumber }}
                      </span>
                      <span class="mt-0.5 block text-meta text-ink-muted">
                        {{ date(invoice.periodStart) }} – {{ date(invoice.periodEnd) }}
                      </span>
                    </span>

                    <span class="flex flex-none items-center gap-3">
                      <span class="text-body text-ink-secondary">
                        {{ money(invoice.total, invoice.currency) }}
                      </span>
                      <vx-status-badge [status]="invoice.status" />
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        @if (invoices().length === 0) {
          <vx-empty-state
            class="mt-4 block"
            icon="agreements"
            title="Nothing to pay"
            description="Invoices from your transport operator will appear here."
          />
        }
      }
    </div>
  `,
})
export class PassengerInvoicesPage {
  private readonly api = inject(PassengerInvoicesApi);

  protected readonly date = formatDate;
  protected readonly money = formatMoney;

  protected readonly invoices = signal<PassengerInvoice[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly outstanding = computed(() =>
    this.invoices().filter((invoice) => invoice.status === 'Open' || invoice.status === 'Overdue'));

  protected readonly settled = computed(() =>
    this.invoices().filter((invoice) => invoice.status !== 'Open' && invoice.status !== 'Overdue'));

  protected readonly totalDue = computed(() =>
    this.outstanding().reduce((sum, invoice) => sum + invoice.total, 0));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.invoices({ pageSize: 50 }).subscribe({
      next: (result) => {
        this.invoices.set(result.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);

        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not reach the server.',
        );
      },
    });
  }
}
