import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlatformApi } from '@vexto/api-client';
import type { TenantResponse } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxCardGrid,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxPageHeader,
  VxSkeletonCard,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { formatDate } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { OperatorPortalLink } from './operator-portal-link';
import { CmsTenantCard } from './tenant-card';
import { administratorSummary } from './tenant-readiness';

interface TenantFilters extends Record<string, unknown> {
  search: string;
  status: string;
  emirate: string;
}

/**
 * The seven emirates, offered as a filter because that is what the pilot market's operators are
 * sorted by. The field on the tenant is free text — a deployment elsewhere types its own regions —
 * so the filter also accepts whatever an operator record actually says.
 */
export const EMIRATES: readonly string[] = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
];

/**
 * Every transport operator on the platform, as the CMS's tenant management home.
 *
 * Card-first: a platform administrator scanning forty operators is looking for a name, a status
 * and whether anybody has accepted the administrator invitation, and a card says all three at a
 * glance. The table is one click away for comparing a column across the whole estate.
 *
 * Nothing operational lives here. Open Tenant goes to the platform control centre for that
 * operator; "Open in Operator Portal" hands the administrator across to the operator app in that
 * tenant's support context, which the API re-authorizes on every request.
 */
@Component({
  selector: 'vexto-cms-tenants-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CmsTenantCard,
    VxCardGrid,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxSkeletonCard,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header title="Tenants" description="Every transport operator using Vexto, and where each one is in onboarding.">
      <a actions class="vx-btn vx-btn-primary" routerLink="/tenants/new" data-testid="create-tenant">
        <vx-icon name="plus" [size]="16" />
        Create Tenant
      </a>
    </vx-page-header>

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
        searchPlaceholder="Search name, legal name or trade licence"
        searchLabel="Search tenants"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select filters class="vx-select w-auto" aria-label="Filter by status" (change)="onStatus($event)">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select filters class="vx-select w-auto" aria-label="Filter by emirate" (change)="onEmirate($event)">
          <option value="">All emirates</option>
          @for (emirate of emirates; track emirate) {
            <option [value]="emirate">{{ emirate }}</option>
          }
        </select>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'tenant' : 'tenants' }}
          </span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid><vx-skeleton-card [count]="6" [media]="true" /></vx-card-grid>
          </div>
        } @else {
          <div class="p-5"><div class="vx-skeleton h-64 w-full"></div></div>
        }
      </div>

      <vx-error-state error title="We could not load tenants" [message]="list.error() ?? ''" (retry)="list.reload()" />

      <vx-empty-state
        empty
        icon="building"
        [title]="list.isFiltered() ? 'No matching tenants' : 'No tenants yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the filters.'
            : 'Create your first transport operator to get started.'
        "
      />

      @if (layout() === 'cards') {
        <vx-card-grid data-testid="tenant-cards">
          @for (tenant of list.items(); track tenant.id) {
            <vexto-cms-tenant-card [tenant]="tenant" (opened)="open(tenant)" (action)="onCardAction(tenant, $event)" />
          }
        </vx-card-grid>
      } @else {
        <table class="vx-table">
          <thead>
            <tr>
              <th scope="col">Tenant</th>
              <th scope="col">Legal name</th>
              <th scope="col">Emirate</th>
              <th scope="col">Status</th>
              <th scope="col">Admin</th>
              <th scope="col">Created</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (tenant of list.items(); track tenant.id) {
              <tr>
                <td class="vx-cell-strong">{{ tenant.name }}</td>
                <td>{{ tenant.legalName }}</td>
                <td>{{ tenant.businessDetails.emirate || '—' }}</td>
                <td><vx-status-badge [status]="tenant.status" /></td>
                <td>{{ adminLabel(tenant) }}</td>
                <td>{{ created(tenant.createdAtUtc) }}</td>
                <td class="text-end">
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="open(tenant)">Open</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </vx-table-shell>
  `,
})
export class CmsTenantsPage {
  private readonly api = inject(PlatformApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly portal = inject(OperatorPortalLink);

  private readonly preference = listViewPreference('cms-tenants');
  protected readonly layout = this.preference.view;
  protected readonly emirates = EMIRATES;
  protected readonly created = formatDate;

  protected readonly list = new PagedList<TenantResponse, TenantFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        emirate: filters.emirate || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '', emirate: '' },
  );

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected onStatus(event: Event): void {
    this.list.setFilter({ status: (event.target as HTMLSelectElement).value });
  }

  protected onEmirate(event: Event): void {
    this.list.setFilter({ emirate: (event.target as HTMLSelectElement).value });
  }

  protected adminLabel(tenant: TenantResponse): string {
    return administratorSummary(tenant).label;
  }

  protected open(tenant: TenantResponse, fragment?: string): void {
    void this.router.navigate(['/tenants', tenant.id], fragment ? { fragment } : undefined);
  }

  protected onCardAction(tenant: TenantResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      open: () => this.open(tenant),
      edit: () => this.open(tenant, 'business'),
      invite: () => this.open(tenant, 'administrators'),
      switch: () => this.portal.open(tenant.id),
      activate: () => this.activate(tenant),
      suspend: () => void this.suspend(tenant),
    };

    handlers[action]?.();
  }

  protected activate(tenant: TenantResponse): void {
    this.api.activate(tenant.id).subscribe({
      next: () => {
        this.toast.success(`${tenant.name} is active.`);
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not activate this tenant.'),
    });
  }

  protected async suspend(tenant: TenantResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Suspend this tenant?',
      message: `Everybody at ${tenant.name} will be unable to sign in until it is reactivated. Their data is kept, and Vexto staff can still enter the tenant to support them.`,
      confirmLabel: 'Suspend tenant',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.suspend(tenant.id).subscribe({
      next: () => {
        this.toast.success(`${tenant.name} suspended.`);
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not suspend this tenant.'),
    });
  }
}
