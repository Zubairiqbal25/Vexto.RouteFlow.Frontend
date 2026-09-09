import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DriversApi } from '@vexto/api-client';
import type { DriverResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxCardGrid,
  VxSkeletonCard,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { daysUntil, formatDate, formatMobile } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { DriverCard } from './driver-card';
import { DriverDrawer } from './driver-drawer';
import { DriverForm } from './driver-form';
import { openFormOnNewParam } from '../../shared/new-record';

interface DriverFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

/** A licence inside this window is flagged; past it, the driver cannot legally drive. */
const EXPIRY_WARNING_DAYS = 45;

@Component({
  selector: 'vexto-drivers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    DriverForm,
    VxAvatar,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxCardGrid,
    VxSkeletonCard,
    VxSkeletonTable,
    DriverCard,
    DriverDrawer,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header title="Drivers" description="Manage drivers, licences and portal access.">
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="add()">
        <vx-icon name="plus" [size]="16" />
        Add Driver
      </button>
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
        searchPlaceholder="Search name, mobile or licence"
        searchLabel="Search drivers"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'driver' : 'drivers' }}
          </span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid><vx-skeleton-card [count]="6" /></vx-card-grid>
          </div>
        } @else {
          <vx-skeleton-table [columns]="7" />
        }
      </div>

      <vx-error-state
        error
        title="We could not load drivers"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="drivers"
        [title]="list.isFiltered() ? 'No matching drivers' : 'No drivers yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the status filter.'
            : 'Add a driver to start assigning them to routes and trips.'
        "
        [actionLabel]="list.isFiltered() ? null : 'Add Driver'"
        (action)="add()"
      />

      @if (layout() === 'cards') {
        <vx-card-grid>
          @for (driver of list.items(); track driver.id) {
            <vexto-driver-card
              [driver]="driver"
              [selected]="inspected()?.id === driver.id"
              (opened)="inspect(driver)"
              (action)="onCardAction(driver, $event)"
            />
          }
        </vx-card-grid>
      } @else {
      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Driver</th>
            <th scope="col">Mobile</th>
            <th scope="col">Licence</th>
            <th scope="col">Licence expiry</th>
            <th scope="col">Account</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (driver of list.items(); track driver.id) {
            <tr>
              <td>
                <div class="flex items-center gap-3">
                  <vx-avatar [name]="driver.firstName" [secondName]="driver.lastName" />
                  <div class="min-w-0">
                    <span class="vx-cell-strong block truncate">
                      {{ driver.firstName }} {{ driver.lastName }}
                    </span>
                    <span class="block truncate text-meta text-ink-muted">
                      {{ driver.email || 'No email' }}
                    </span>
                  </div>
                </div>
              </td>
              <td>{{ mobile(driver.mobileNumber) }}</td>
              <td>{{ driver.licenseNumber }}</td>
              <td>
                <!-- An expiring licence is the single most operationally useful thing on this page. -->
                @if (expiryTone(driver.licenseExpiryDate); as tone) {
                  <vx-status-badge
                    [tone]="tone"
                    [label]="date(driver.licenseExpiryDate)"
                    icon="alert"
                  />
                } @else {
                  {{ date(driver.licenseExpiryDate) }}
                }
              </td>
              <td>
                @if (driver.userId) {
                  <vx-status-badge tone="success" label="Portal access" icon="check" />
                } @else {
                  <span class="text-ink-muted">No account</span>
                }
              </td>
              <td><vx-status-badge [status]="driver.status" /></td>
              <td class="text-end">
                <vx-row-actions [label]="'Actions for ' + driver.firstName">
                  <vx-row-action icon="eye" (selected)="edit(driver)">View</vx-row-action>
                  <ng-container *vxCan="manage">
                    <vx-row-action icon="edit" (selected)="edit(driver)">Edit</vx-row-action>
                    @if (driver.status === 'Active') {
                      <vx-row-action icon="power" [danger]="true" (selected)="deactivate(driver)">
                        Deactivate
                      </vx-row-action>
                    } @else {
                      <vx-row-action icon="check" (selected)="activate(driver)">
                        Activate
                      </vx-row-action>
                    }
                  </ng-container>
                </vx-row-actions>
              </td>
            </tr>
          }
        </tbody>
      </table>
      }
    </vx-table-shell>

    <vexto-driver-drawer
      [driver]="inspected()"
      (closed)="inspected.set(null)"
      (edit)="editFromDrawer($event)"
    />

    <vexto-driver-form
      [open]="formOpen()"
      [driver]="editing()"
      (dismissed)="formOpen.set(false)"
      (saved)="onSaved()"
    />
  `,
})
export class DriversPage {
  private readonly api = inject(DriversApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly manage = VextoPermissions.Drivers.Manage;

  private readonly preference = listViewPreference('drivers');
  protected readonly layout = this.preference.view;

  protected readonly formOpen = signal(false);

  /** The driver shown in the quick-view drawer. Null is the normal state. */
  protected readonly inspected = signal<DriverResponse | null>(null);
  protected readonly editing = signal<DriverResponse | null>(null);

  protected readonly list = new PagedList<DriverResponse, DriverFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  protected inspect(driver: DriverResponse): void {
    this.inspected.set(driver);
  }

  /** The drawer is the shortcut; editing is still the record's own form. */
  protected editFromDrawer(driver: DriverResponse): void {
    this.inspected.set(null);
    this.edit(driver);
  }

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  /** Routes an overflow-menu choice to the same handlers the table rows use. */
  protected onCardAction(driver: DriverResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      edit: () => this.edit(driver),
      invite: () => this.edit(driver),
      activate: () => this.activate(driver),
      deactivate: () => void this.deactivate(driver),
    };

    handlers[action]?.();
  }

  protected readonly mobile = formatMobile;
  protected readonly date = formatDate;

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /** Null when the licence is comfortably valid, so the cell stays quiet in the common case. */
  protected expiryTone(expiry: string): 'danger' | 'warning' | null {
    const days = daysUntil(expiry);

    if (days < 0) {
      return 'danger';
    }

    return days <= EXPIRY_WARNING_DAYS ? 'warning' : null;
  }

  constructor() {
    // Lets the command palette’s “Create…” quick action land here with the form already open.
    openFormOnNewParam(() => this.add());
  }

  protected add(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(driver: DriverResponse): void {
    this.editing.set(driver);
    this.formOpen.set(true);
  }

  protected onSaved(): void {
    this.formOpen.set(false);
    this.list.refreshQuietly();
  }

  protected activate(driver: DriverResponse): void {
    this.api.activate(driver.id).subscribe({
      next: () => {
        this.toast.success(`${driver.firstName} can be assigned to trips.`);
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not activate this driver.'),
    });
  }

  protected async deactivate(driver: DriverResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Deactivate driver?',
      message: `${driver.firstName} ${driver.lastName} will no longer be assignable to routes or trips.`,
      confirmLabel: 'Deactivate',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.deactivate(driver.id).subscribe({
      next: () => {
        this.toast.success('Driver deactivated.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not deactivate this driver.'),
    });
  }
}
