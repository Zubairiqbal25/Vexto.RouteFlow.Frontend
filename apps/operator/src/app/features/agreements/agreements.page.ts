import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AgreementsApi } from '@vexto/api-client';
import type { AgreementResponse } from '@vexto/models';
import {
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxPageHeader,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatDate, humanizeEnum } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface AgreementFilters extends Record<string, unknown> {
  search: string;
  status: string;
  type: string;
}

/**
 * The contracts this operator holds.
 *
 * Read-only in this milestone: creating and signing an agreement involves document upload and a
 * signature date, which is a full-page workflow rather than a drawer, and is not part of the pilot.
 */
@Component({
  selector: 'vexto-agreements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxPageHeader,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header
      title="Agreements"
      description="Transport contracts and their current status."
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
        searchPlaceholder="Search number or title"
        searchLabel="Search agreements"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by type"
          (change)="list.setFilter({ type: value($event) })"
        >
          <option value="">All types</option>
          <option value="OperatorSubscription">Operator subscription</option>
          <option value="CustomerTransport">Customer transport</option>
          <option value="CorporateTransport">Corporate transport</option>
          <option value="Other">Other</option>
        </select>

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="PendingSignature">Pending signature</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
          <option value="Terminated">Terminated</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'agreement' : 'agreements' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="5" />

      <vx-error-state
        error
        title="We could not load agreements"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="agreements"
        title="No agreements"
        description="Transport agreements will appear here once they have been created."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Agreement</th>
            <th scope="col">Type</th>
            <th scope="col">Starts</th>
            <th scope="col">Ends</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (agreement of list.items(); track agreement.id) {
            <tr>
              <td>
                <span class="vx-cell-strong block">{{ agreement.agreementNumber }}</span>
                <span class="block truncate text-meta text-ink-muted">{{ agreement.title }}</span>
              </td>
              <td>{{ label(agreement.type) }}</td>
              <td>{{ date(agreement.startDate) }}</td>
              <td>{{ agreement.endDate ? date(agreement.endDate) : 'Open-ended' }}</td>
              <td><vx-status-badge [status]="agreement.status" /></td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>
  `,
})
export class AgreementsPage {
  private readonly api = inject(AgreementsApi);

  protected readonly date = formatDate;
  protected readonly label = humanizeEnum;

  protected readonly list = new PagedList<AgreementResponse, AgreementFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '', type: '' },
  );

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
