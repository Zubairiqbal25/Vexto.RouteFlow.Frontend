import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PaymentsApi, VextoApiError } from '@vexto/api-client';
import type { Payment, PaymentStatus } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxModal,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatDateTime, formatMoney } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface PaymentFilters extends Record<string, unknown> {
  search: string;
  status: string;
  fromDate: string;
  toDate: string;
}

/**
 * Money that has actually moved, and the one screen that can send it back.
 *
 * **Provider fee and net are blank until the provider reports them.** They are never estimated
 * from a percentage: a calculated figure in a column beside settled amounts reads as fact, and an
 * operator reconciling against their bank statement would find it does not match. A dash is honest.
 */
@Component({
  selector: 'vexto-payments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxModal,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header
      title="Payments"
      description="Fares collected from passengers, and refunds."
    />

    <vx-table-shell
      [loading]="list.loading()"
      [error]="list.error()"
      [isEmpty]="list.isEmpty()"
      [page]="list.page()"
      [pageSize]="list.pageSize"
      [totalCount]="list.total()"
      (pageChange)="list.setPage($event)"
    >
      <vx-filter-bar
        toolbar
        searchPlaceholder="Search provider reference"
        searchLabel="Search payments"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Succeeded">Succeeded</option>
          <option value="Pending">Pending</option>
          <option value="RequiresAction">Requires action</option>
          <option value="Failed">Failed</option>
          <option value="PartiallyRefunded">Partially refunded</option>
          <option value="Refunded">Refunded</option>
        </select>

        <label filters class="flex items-center gap-2 text-meta text-ink-muted">
          From
          <input
            class="vx-input w-auto"
            type="date"
            aria-label="Paid from"
            (change)="list.setFilter({ fromDate: value($event) })"
          />
        </label>

        <label filters class="flex items-center gap-2 text-meta text-ink-muted">
          To
          <input
            class="vx-input w-auto"
            type="date"
            aria-label="Paid to"
            (change)="list.setFilter({ toDate: value($event) })"
          />
        </label>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'payment' : 'payments' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="7" />

      <vx-error-state
        error
        title="We could not load payments"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="agreements"
        title="No payments yet"
        description="Payments appear here once passengers start paying their invoices online."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Passenger</th>
            <th scope="col">Paid</th>
            <th scope="col" class="text-right">Gross</th>
            <th scope="col" class="text-right">Platform fee</th>
            <th scope="col" class="text-right">Gateway fee</th>
            <th scope="col" class="text-right">Net</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (payment of list.items(); track payment.id) {
            <tr>
              <td>
                <span class="vx-cell-strong block">{{ payment.passengerName }}</span>

                @if (payment.failureCode; as code) {
                  <span class="block text-meta text-ink-muted">{{ code }}</span>
                }
              </td>
              <td class="text-meta text-ink-muted">
                {{ payment.paidAtUtc ? dateTime(payment.paidAtUtc) : '—' }}
              </td>
              <td class="text-right">
                <span class="vx-cell-strong">{{ money(payment.amount, payment.currency) }}</span>

                @if (payment.refundedAmount > 0) {
                  <span class="block text-meta text-ink-muted">
                    −{{ money(payment.refundedAmount, payment.currency) }}
                  </span>
                }
              </td>
              <td class="text-right">{{ money(payment.platformFee, payment.currency) }}</td>

              <!--
                Both blank until the provider reports them. See the class remarks: a dash here is
                the honest answer, and a formula would not be.
              -->
              <td class="text-right">{{ money(payment.providerFee, payment.currency) }}</td>
              <td class="text-right">{{ money(payment.netAmount, payment.currency) }}</td>
              <td><vx-status-badge [status]="payment.status" /></td>
              <td class="text-right">
                @if (canRefund() && refundable(payment)) {
                  <vx-row-actions label="Payment actions">
                    <vx-row-action icon="close" (selected)="openRefund(payment)">
                      Refund
                    </vx-row-action>
                  </vx-row-actions>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>

    @if (refunding(); as payment) {
      <vx-modal
        title="Refund this payment"
        [open]="true"
        (closed)="refunding.set(null)"
      >
        <p class="text-body text-ink-secondary">
          {{ payment.passengerName }} paid {{ money(payment.amount, payment.currency) }}.
          {{ money(remaining(payment), payment.currency) }} can still be returned.
        </p>

        <form class="mt-5" (submit)="submitRefund($event)">
          <label class="block">
            <span class="vx-section-label">Amount</span>
            <input
              class="vx-input mt-1 w-full"
              type="number"
              step="0.01"
              min="0.01"
              [max]="remaining(payment)"
              [value]="refundAmount()"
              aria-label="Refund amount"
              (input)="refundAmount.set(text($event))"
            />
          </label>

          <p class="mt-1.5 text-meta text-ink-muted">
            Leave it as it is to return everything that is left.
          </p>

          <label class="mt-4 block">
            <span class="vx-section-label">Reason</span>
            <input
              class="vx-input mt-1 w-full"
              type="text"
              maxlength="500"
              placeholder="Why is this being refunded?"
              aria-label="Refund reason"
              [value]="refundReason()"
              (input)="refundReason.set(text($event))"
            />
            <span class="mt-1.5 block text-meta text-ink-muted">
              Kept in Vexto for your own records. It is not sent to the payment provider.
            </span>
          </label>

          <div class="mt-6 flex justify-end gap-3">
            <button
              type="button"
              class="vx-btn vx-btn-secondary"
              [disabled]="busy()"
              (click)="refunding.set(null)"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="vx-btn vx-btn-primary"
              [disabled]="busy()"
              (click)="submitRefund($event)"
            >
              {{ busy() ? 'Refunding…' : 'Refund' }}
            </button>
          </div>
        </form>
      </vx-modal>
    }
  `,
})
export class PaymentsPage {
  private readonly api = inject(PaymentsApi);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);

  protected readonly dateTime = formatDateTime;
  protected readonly money = formatMoney;

  protected readonly refunding = signal<Payment | null>(null);
  protected readonly refundAmount = signal('');
  protected readonly refundReason = signal('');
  protected readonly busy = signal(false);

  /** The most dangerous grant in the product, and not part of a dispatcher's bundle. */
  protected readonly canRefund = computed(() =>
    this.permissions.has(VextoPermissions.Payments.Manage));

  protected readonly list = new PagedList<Payment, PaymentFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: (filters.status || undefined) as PaymentStatus,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '', fromDate: '', toDate: '' },
  );

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement).value;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected refundable(payment: Payment): boolean {
    return (
      (payment.status === 'Succeeded' || payment.status === 'PartiallyRefunded')
      && this.remaining(payment) > 0
    );
  }

  protected remaining(payment: Payment): number {
    return Math.round((payment.amount - payment.refundedAmount) * 100) / 100;
  }

  protected openRefund(payment: Payment): void {
    this.refunding.set(payment);
    this.refundAmount.set(this.remaining(payment).toFixed(2));
    this.refundReason.set('');
  }

  protected submitRefund(event: Event): void {
    event.preventDefault();

    const payment = this.refunding();

    if (!payment || this.busy()) {
      return;
    }

    const amount = Number.parseFloat(this.refundAmount());

    if (!Number.isFinite(amount) || amount <= 0) {
      this.toast.error('Enter an amount greater than zero.');

      return;
    }

    this.busy.set(true);

    this.api
      .refund(payment.id, { amount, reason: this.refundReason() || null })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.refunding.set(null);
          this.toast.success('Refund sent to the passenger.');
          this.list.reload();
        },
        error: (error: unknown) => {
          this.busy.set(false);

          // The server refuses an over-refund with a message naming what is actually left, which
          // is more useful than anything this screen could say.
          this.toast.error(
            error instanceof VextoApiError ? error.message : 'We could not issue that refund.',
          );
        },
      });
  }
}
