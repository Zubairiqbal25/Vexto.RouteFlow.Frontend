import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AgreementsApi, VextoApiError } from '@vexto/api-client';
import type { AgreementResponse } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxCardFact,
  VxCardGrid,
  VxDrawer,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxPageHeader,
  VxSkeletonCard,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { formatDate, humanizeEnum, serviceDate } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { AgreementCard } from './agreement-card';

interface AgreementFilters extends Record<string, unknown> {
  search: string;
  status: string;
  type: string;
}

/**
 * The contracts this operator holds.
 *
 * Cards lead, because the question an account manager brings to this screen is "which of these
 * needs attention" — a state and a date, per contract — and a table answers that only after you
 * have read five columns on forty rows. The table is still one click away for anybody comparing
 * end dates down a column, which is a real finance task.
 *
 * Activation and termination are offered here rather than only on a detail page: they are the two
 * state changes the API exposes, and both are single decisions that do not need a form.
 */
@Component({
  selector: 'vexto-agreements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgreementCard,
    RouterLink,
    VxCardFact,
    VxCardGrid,
    VxDrawer,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxPageHeader,
    VxSkeletonCard,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header
      title="Agreements"
      description="Transport contracts and their current status."
    />

    <vx-table-shell
      [layout]="layout()"
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

        <span trailing class="flex items-center gap-3">
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
        <span trailing class="hidden text-meta text-ink-muted sm:inline">
          {{ list.total() }} {{ list.total() === 1 ? 'agreement' : 'agreements' }}
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid [dense]="true"><vx-skeleton-card [count]="6" [media]="false" /></vx-card-grid>
          </div>
        } @else {
          <vx-skeleton-table [columns]="5" />
        }
      </div>

      <vx-error-state
        error
        title="We could not load agreements"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="agreements"
        [title]="list.isFiltered() ? 'No matching agreements' : 'No agreements'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the filters.'
            : 'Transport agreements will appear here once they have been created.'
        "
      />

      @if (layout() === 'cards') {
        <vx-card-grid [dense]="true">
          @for (agreement of list.items(); track agreement.id) {
            <vexto-agreement-card
              [agreement]="agreement"
              [canManage]="canManage()"
              (opened)="open(agreement)"
              (action)="onAction(agreement, $event)"
            />
          }
        </vx-card-grid>
      } @else {
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
              <tr class="cursor-pointer" (click)="open(agreement)">
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
      }
    </vx-table-shell>

    <vx-drawer
      [open]="viewing() !== null"
      [title]="viewing()?.agreementNumber ?? ''"
      [subtitle]="viewing()?.title ?? null"
      (closed)="viewing.set(null)"
    >
      @if (viewing(); as agreement) {
        <div class="flex flex-col gap-5">
          <vx-status-badge [status]="agreement.status" />

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Type" [value]="label(agreement.type)" />
            <vx-card-fact label="Renewal" [value]="agreement.autoRenew ? 'Automatic' : 'Manual'" />
            <vx-card-fact label="Starts" [value]="date(agreement.startDate)" />
            <vx-card-fact
              label="Ends"
              [value]="agreement.endDate ? date(agreement.endDate) : 'Open-ended'"
            />
            <vx-card-fact
              label="Signed"
              [value]="agreement.signedDate ? date(agreement.signedDate) : 'Not signed'"
            />
            <vx-card-fact label="Created" [value]="date(agreement.createdAtUtc)" />
          </div>

          @if (agreement.description) {
            <div>
              <p class="vx-section-label mb-1">Description</p>
              <p class="text-body text-ink-secondary">{{ agreement.description }}</p>
            </div>
          }

          @if (agreement.notes) {
            <div>
              <p class="vx-section-label mb-1">Notes</p>
              <p class="text-body text-ink-secondary">{{ agreement.notes }}</p>
            </div>
          }
        </div>
      }

      <div footer class="flex flex-wrap gap-2">
        @if (viewing(); as agreement) {
          <a class="vx-btn vx-btn-secondary flex-1" [routerLink]="['/agreements', agreement.id]">
            Open agreement
          </a>
        }
        @if (canManage() && viewing(); as agreement) {
          @if (agreement.status === 'Draft' || agreement.status === 'PendingSignature') {
            <button
              type="button"
              class="vx-btn vx-btn-primary flex-1"
              [disabled]="working()"
              (click)="activate(agreement)"
            >
              Activate
            </button>
          } @else if (agreement.status === 'Active') {
            <button
              type="button"
              class="vx-btn vx-btn-secondary flex-1"
              [disabled]="working()"
              (click)="terminate(agreement)"
            >
              Terminate
            </button>
          }
        }
      </div>
    </vx-drawer>
  `,
})
export class AgreementsPage {
  private readonly api = inject(AgreementsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  protected readonly date = formatDate;
  protected readonly label = humanizeEnum;

  private readonly preference = listViewPreference('agreements');
  protected readonly layout = this.preference.view;

  protected readonly viewing = signal<AgreementResponse | null>(null);
  protected readonly working = signal(false);
  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Agreements.Manage),
  );

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

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  /**
   * A click opens the quick view; "Open agreement" goes to the page.
   *
   * The drawer answers "which one is this" without losing the list; the page is where the documents
   * are, because uploading and reading a contract in a 26rem panel is cramped.
   */
  protected open(agreement: AgreementResponse): void {
    this.viewing.set(agreement);
  }

  protected onAction(agreement: AgreementResponse, action: string): void {
    if (action === 'open' || action === 'edit') {
      void this.router.navigate(['/agreements', agreement.id]);
    } else if (action === 'activate') {
      this.activate(agreement);
    } else if (action === 'terminate') {
      void this.terminate(agreement);
    }
  }

  /**
   * Puts an agreement into effect.
   *
   * The signed date defaults to today: activating a contract is somebody recording that it has been
   * signed, and asking them to type the date they are doing it in is friction with no upside. A
   * back-dated signature is an edit, not an activation.
   */
  protected activate(agreement: AgreementResponse): void {
    if (this.working()) {
      return;
    }

    this.working.set(true);

    this.api.activate(agreement.id, serviceDate()).subscribe({
      next: () => this.done('Agreement activated.'),
      error: (error: unknown) => this.fail(error, 'We could not activate this agreement.'),
    });
  }

  protected async terminate(agreement: AgreementResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Terminate this agreement?',
      message: `${agreement.agreementNumber} will stop being in force. This cannot be undone.`,
      confirmLabel: 'Terminate',
      danger: true,
    });

    if (!confirmed || this.working()) {
      return;
    }

    this.working.set(true);

    this.api.terminate(agreement.id, null).subscribe({
      next: () => this.done('Agreement terminated.'),
      error: (error: unknown) => this.fail(error, 'We could not terminate this agreement.'),
    });
  }

  private done(message: string): void {
    this.working.set(false);
    this.viewing.set(null);
    this.toast.success(message);
    this.list.refreshQuietly();
  }

  private fail(error: unknown, fallback: string): void {
    this.working.set(false);
    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
