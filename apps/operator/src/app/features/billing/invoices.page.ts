import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PassengerBillingApi, VextoApiError } from '@vexto/api-client';
import type { BillingSummary, PassengerInvoice, PassengerInvoiceStatus } from '@vexto/models';
import { VextoPermissions, PermissionService } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatDate, formatMoney } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface InvoiceFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

/**
 * What passengers owe this operator.
 *
 * The four summary cards come from one aggregated request rather than from adding up the rows on
 * screen: the figures are for the whole tenant, and a page of twenty invoices cannot produce them.
 */
@Component({
  selector: 'vexto-passenger-invoices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header
      title="Invoices"
      description="What passengers owe this operator for transport."
    />

    @if (summary(); as figures) {
      <div class="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="vx-card p-5">
          <p class="vx-section-label">Open invoices</p>
          <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {{ figures.openInvoiceCount }}
          </p>
        </div>
        <div class="vx-card p-5">
          <p class="vx-section-label">Outstanding</p>
          <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {{ money(figures.outstandingAmount, figures.currency) }}
          </p>
        </div>
        <div class="vx-card p-5">
          <p class="vx-section-label">Collected this month</p>
          <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {{ money(figures.collectedThisMonth, figures.currency) }}
          </p>
          <p class="mt-1 text-meta text-ink-muted">Net of refunds.</p>
        </div>
        <div class="vx-card p-5">
          <p class="vx-section-label">Failed payments</p>
          <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {{ figures.failedPaymentCount }}
          </p>
          <p class="mt-1 text-meta text-ink-muted">This month.</p>
        </div>
      </div>
    }

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
        searchPlaceholder="Search invoice number"
        searchLabel="Search invoices"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
          <option value="PartiallyRefunded">Partially refunded</option>
          <option value="Refunded">Refunded</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'invoice' : 'invoices' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="6" />

      <vx-error-state
        error
        title="We could not load invoices"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="agreements"
        title="No invoices yet"
        description="Invoices appear here once they have been raised from a passenger subscription."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Passenger</th>
            <th scope="col">Period</th>
            <th scope="col">Due</th>
            <th scope="col" class="text-right">Total</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (invoice of list.items(); track invoice.id) {
            <tr>
              <td><span class="vx-cell-strong block">{{ invoice.invoiceNumber }}</span></td>
              <td>{{ invoice.passengerName }}</td>
              <td class="text-meta text-ink-muted">
                {{ date(invoice.periodStart) }} – {{ date(invoice.periodEnd) }}
              </td>
              <td>{{ date(invoice.dueDate) }}</td>
              <td class="text-right">
                <span class="vx-cell-strong">{{ money(invoice.total, invoice.currency) }}</span>

                @if (invoice.refundedAmount > 0) {
                  <span class="block text-meta text-ink-muted">
                    {{ money(invoice.refundedAmount, invoice.currency) }} refunded
                  </span>
                }
              </td>
              <td><vx-status-badge [status]="invoice.status" /></td>
              <td class="text-right">
                @if (canManage() && cancellable(invoice)) {
                  <vx-row-actions [label]="'Actions for ' + invoice.invoiceNumber">
                    <vx-row-action
                      [danger]="true"
                      icon="close"
                      [disabled]="busy() === invoice.id"
                      (selected)="cancel(invoice)"
                    >
                      Cancel invoice
                    </vx-row-action>
                  </vx-row-actions>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>
  `,
})
export class PassengerInvoicesPage {
  private readonly api = inject(PassengerBillingApi);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly date = formatDate;
  protected readonly money = formatMoney;

  protected readonly summary = signal<BillingSummary | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Billing.Manage));

  protected readonly list = new PagedList<PassengerInvoice, InvoiceFilters>(
    (filters, page, pageSize) =>
      this.api.invoices({
        search: filters.search || undefined,
        status: (filters.status || undefined) as PassengerInvoiceStatus,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  constructor() {
    // A summary that fails leaves the cards hidden rather than the page broken. The list below is
    // the part somebody came for, and it loads independently.
    this.api.summary().subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /** A paid invoice is refunded, never cancelled — cancelling it would simply lose the money. */
  protected cancellable(invoice: PassengerInvoice): boolean {
    return invoice.status === 'Open' || invoice.status === 'Overdue' || invoice.status === 'Draft';
  }

  protected async cancel(invoice: PassengerInvoice): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Cancel ${invoice.invoiceNumber}?`,
      message:
        'The passenger will no longer be asked to pay it. This cannot be undone, and a new ' +
        'invoice would have to be raised.',
      confirmLabel: 'Cancel invoice',
      cancelLabel: 'Keep it',
    });

    if (!confirmed) {
      return;
    }

    this.busy.set(invoice.id);

    this.api.cancelInvoice(invoice.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success(`${invoice.invoiceNumber} cancelled.`);
        this.list.reload();
      },
      error: (error: unknown) => {
        this.busy.set(null);

        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not cancel that invoice.',
        );
      },
    });
  }
}
