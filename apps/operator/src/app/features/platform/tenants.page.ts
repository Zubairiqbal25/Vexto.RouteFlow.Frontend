import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlatformApi } from '@vexto/api-client';
import { TenantContextService } from '@vexto/auth';
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
import { TenantCard } from './tenant-card';

interface TenantFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

/**
 * Every transport operator on the platform.
 *
 * ServiceAdmin only, gated on `Tenants.View` — a permission no tenant role holds, and one a
 * platform administrator satisfies through the single authorization bypass. There is no role check
 * here or in the route guard.
 *
 * "Enter tenant context" is the action that matters: it switches the whole portal into that
 * operator's data so Vexto's staff can see the screens the customer sees. The switch is a request
 * header validated server-side on every request; this page only records the choice.
 */
@Component({
  selector: 'vexto-platform-tenants-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TenantCard,
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
    <vx-page-header
      title="Tenants"
      description="Every transport operator using Vexto."
    >
      <a actions class="vx-btn vx-btn-primary" routerLink="/platform/tenants/new">
        <vx-icon name="plus" [size]="16" />
        Add Tenant
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
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="onStatus($event)"
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'operator' : 'operators' }}
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
          <div class="p-5">
            <div class="vx-skeleton h-64 w-full"></div>
          </div>
        }
      </div>

      <vx-error-state
        error
        title="We could not load tenants"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="building"
        [title]="list.isFiltered() ? 'No matching operators' : 'No operators yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the status filter.'
            : 'Onboard your first transport operator to get started.'
        "
      />

      @if (layout() === 'cards') {
        <vx-card-grid>
          @for (tenant of list.items(); track tenant.id) {
            <vexto-tenant-card
              [tenant]="tenant"
              [selected]="context.current()?.id === tenant.id"
              (opened)="enter(tenant)"
              (action)="onCardAction(tenant, $event)"
            />
          }
        </vx-card-grid>
      } @else {
        <table class="vx-table">
          <thead>
            <tr>
              <th scope="col">Operator</th>
              <th scope="col">Legal name</th>
              <th scope="col">Trade licence</th>
              <th scope="col">Location</th>
              <th scope="col">Status</th>
              <th scope="col">Onboarded</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (tenant of list.items(); track tenant.id) {
              <tr>
                <td class="vx-cell-strong">{{ tenant.name }}</td>
                <td>{{ tenant.legalName }}</td>
                <td>{{ tenant.tradeLicenseNumber }}</td>
                <td>{{ location(tenant) }}</td>
                <td><vx-status-badge [status]="tenant.status" /></td>
                <td>{{ onboarded(tenant.createdAtUtc) }}</td>
                <td class="text-end">
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="enter(tenant)">
                    Enter
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </vx-table-shell>
  `,
})
export class PlatformTenantsPage {
  private readonly api = inject(PlatformApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly context = inject(TenantContextService);

  private readonly preference = listViewPreference('platform-tenants');
  protected readonly layout = this.preference.view;

  protected readonly onboarded = formatDate;

  protected readonly list = new PagedList<TenantResponse, TenantFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected onStatus(event: Event): void {
    this.list.setFilter({ status: (event.target as HTMLSelectElement).value });
  }

  protected location(tenant: TenantResponse): string {
    const details = tenant.businessDetails;

    return [details.city, details.emirate].filter(Boolean).join(', ') || '—';
  }

  /**
   * Enters the operator's support context and leaves the platform surface.
   *
   * The navigation is the point: staying on the tenant list while every other request has silently
   * become another operator's is how somebody edits the wrong tenant's records.
   */
  protected enter(tenant: TenantResponse): void {
    this.context.enter({
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
    });

    this.toast.success(`You are now working in ${tenant.name}.`);
    void this.router.navigateByUrl('/dashboard');
  }

  protected onCardAction(tenant: TenantResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      enter: () => this.enter(tenant),
      view: () => this.enter(tenant),
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
      error: () => this.toast.error('We could not activate this operator.'),
    });
  }

  protected async suspend(tenant: TenantResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Suspend this operator?',
      message: `Everybody at ${tenant.name} will be unable to sign in until it is reactivated. Their data is kept, and Vexto staff can still enter the tenant to support them.`,
      confirmLabel: 'Suspend operator',
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
      error: () => this.toast.error('We could not suspend this operator.'),
    });
  }

}
