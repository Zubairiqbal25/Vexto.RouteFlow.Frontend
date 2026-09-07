import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RoutesApi } from '@vexto/api-client';
import type { RouteListItem, RouteResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxPageHeader,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { PagedList } from '../../shared/paged-list';
import { RouteForm } from './route-form';

interface RouteFilters extends Record<string, unknown> {
  search: string;
  status: string;
  direction: string;
}

/**
 * Routes are the spine of the product, so this list opens straight into the detail page on click
 * rather than hiding it behind a row menu.
 *
 * Stop, passenger and schedule counts, and whoever is rostered today, come down on the list row
 * itself. That is what answers "which of my routes has no driver" without opening every one of
 * them — the backend computes them in a fixed number of queries per page, so nothing here scales
 * with the number of rows.
 */
@Component({
  selector: 'vexto-routes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouteForm,
    RouterLink,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header
      title="Routes"
      description="Repeatable journeys with their stops, passengers, crew and schedule."
    >
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="add()">
        <vx-icon name="plus" [size]="16" />
        New Route
      </button>
    </vx-page-header>

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
        searchPlaceholder="Search code or name"
        searchLabel="Search routes"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by direction"
          (change)="list.setFilter({ direction: value($event) })"
        >
          <option value="">All directions</option>
          <option value="Outbound">Outbound</option>
          <option value="Return">Return</option>
          <option value="Circular">Circular</option>
          <option value="Other">Other</option>
        </select>

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Draft">Draft</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'route' : 'routes' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="8" />

      <vx-error-state
        error
        title="We could not load routes"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="routes"
        [title]="list.isFiltered() ? 'No matching routes' : 'No routes yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the filters.'
            : 'Create your first route, then add its stops and passengers.'
        "
        [actionLabel]="list.isFiltered() ? null : 'New Route'"
        (action)="add()"
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Route name</th>
            <th scope="col">Direction</th>
            <th scope="col">Default start</th>
            <th scope="col" class="text-right">Stops</th>
            <th scope="col" class="text-right">Passengers</th>
            <th scope="col">Rostered</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (row of list.items(); track row.route.id) {
            <tr class="cursor-pointer" (click)="open(row.route)">
              <td>
                <a
                  class="vx-cell-strong hover:underline"
                  [routerLink]="['/routes', row.route.id]"
                  (click)="$event.stopPropagation()"
                >
                  {{ row.route.code }}
                </a>
              </td>
              <td>
                <span class="block text-ink-secondary">{{ row.route.name }}</span>
                @if (row.route.description) {
                  <span class="block truncate text-meta text-ink-muted">
                    {{ row.route.description }}
                  </span>
                }
              </td>
              <td>{{ row.route.direction }}</td>
              <td>{{ startTime(row.route) }}</td>
              <td class="text-right tabular-nums">{{ row.stopCount }}</td>
              <td class="text-right tabular-nums">{{ row.activePassengerCount }}</td>
              <td>
                @if (row.currentDriverName) {
                  <span class="block truncate">{{ row.currentDriverName }}</span>
                  <span class="block text-meta text-ink-muted">
                    {{ row.currentVehiclePlateNumber ?? 'No vehicle' }}
                  </span>
                } @else {
                  <span class="text-ink-muted">Unassigned</span>
                }
              </td>
              <td><vx-status-badge [status]="row.route.status" /></td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>

    <vexto-route-form
      [open]="formOpen()"
      [route]="null"
      (dismissed)="formOpen.set(false)"
      (saved)="onCreated($event)"
    />
  `,
})
export class RoutesPage {
  private readonly api = inject(RoutesApi);
  private readonly router = inject(Router);

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly formOpen = signal(false);

  protected readonly list = new PagedList<RouteListItem, RouteFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        direction: filters.direction || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '', direction: '' },
  );

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected startTime(route: RouteResponse): string {
    return route.defaultStartTime ? route.defaultStartTime.slice(0, 5) : '—';
  }

  protected add(): void {
    this.formOpen.set(true);
  }

  /** A new route has nothing in it yet, so go straight to where the work continues. */
  protected onCreated(route: RouteResponse): void {
    this.formOpen.set(false);
    void this.router.navigate(['/routes', route.id]);
  }

  protected open(route: RouteResponse): void {
    void this.router.navigate(['/routes', route.id]);
  }
}
