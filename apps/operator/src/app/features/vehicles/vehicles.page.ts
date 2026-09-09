import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { VehiclesApi } from '@vexto/api-client';
import type { VehicleOperations, VehicleResponse } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxSkeletonTable,
  VxCardGrid,
  VxSkeletonCard,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { humanizeEnum } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { VehicleCard } from './vehicle-card';
import { VehicleDrawer } from './vehicle-drawer';
import { VehicleForm } from './vehicle-form';
import { openFormOnNewParam } from '../../shared/new-record';

interface VehicleFilters extends Record<string, unknown> {
  search: string;
  status: string;
  vehicleType: string;
}

@Component({
  selector: 'vexto-vehicles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    VehicleDrawer,
    VehicleForm,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VehicleCard,
    VxCardGrid,
    VxSkeletonCard,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header title="Vehicles" description="Your fleet, its capacity and its availability.">
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="add()">
        <vx-icon name="plus" [size]="16" />
        Add Vehicle
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
        searchPlaceholder="Search plate, make or model"
        searchLabel="Search vehicles"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by vehicle type"
          (change)="list.setFilter({ vehicleType: value($event) })"
        >
          <option value="">All types</option>
          <option value="Bus">Bus</option>
          <option value="MiniBus">Mini bus</option>
          <option value="Van">Van</option>
          <option value="Car">Car</option>
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
          <option value="Maintenance">Maintenance</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="flex items-center gap-3">
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
        <span trailing class="hidden text-meta text-ink-muted sm:inline">
          {{ list.total() }} {{ list.total() === 1 ? 'vehicle' : 'vehicles' }}
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid [dense]="true"><vx-skeleton-card [count]="6" /></vx-card-grid>
          </div>
        } @else {
          <vx-skeleton-table [columns]="7" />
        }
      </div>

      <vx-error-state
        error
        title="We could not load vehicles"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="vehicle"
        [title]="list.isFiltered() ? 'No matching vehicles' : 'No vehicles yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the filters.'
            : 'Add a vehicle so routes have something to run on.'
        "
        [actionLabel]="list.isFiltered() ? null : 'Add Vehicle'"
        (action)="add()"
      />

      @if (layout() === 'cards') {
        <vx-card-grid [dense]="true">
          @for (vehicle of list.items(); track vehicle.id) {
            <vexto-vehicle-card
              [vehicle]="vehicle"
              [operations]="operationsFor(vehicle.id)"
              [selected]="previewing()?.id === vehicle.id"
              (opened)="preview(vehicle)"
              (action)="onCardAction(vehicle, $event)"
            />
          }
        </vx-card-grid>
      } @else {
      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Vehicle</th>
            <th scope="col">Plate number</th>
            <th scope="col">Type</th>
            <th scope="col">Capacity</th>
            <th scope="col">Make / model</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (vehicle of list.items(); track vehicle.id) {
            <tr>
              <td>
                <div class="flex items-center gap-3">
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-lg bg-surface-muted text-ink-secondary"
                  >
                    <vx-icon name="vehicle" [size]="18" />
                  </span>
                  <div class="min-w-0">
                    <span class="vx-cell-strong block truncate">{{ plate(vehicle) }}</span>
                    <span class="block text-meta text-ink-muted">
                      {{ vehicle.emirate ? label(vehicle.emirate) : 'Emirate not set' }}
                    </span>
                  </div>
                </div>
              </td>
              <td>{{ vehicle.plateNumber }}</td>
              <td>{{ label(vehicle.vehicleType) }}</td>
              <td>{{ vehicle.capacity }} seats</td>
              <td>
                @if (vehicle.make || vehicle.model) {
                  {{ vehicle.make }} {{ vehicle.model }}
                  @if (vehicle.year) {
                    <span class="text-ink-muted">· {{ vehicle.year }}</span>
                  }
                } @else {
                  —
                }
              </td>
              <td><vx-status-badge [status]="vehicle.status" /></td>
              <td class="text-end">
                <vx-row-actions [label]="'Actions for ' + vehicle.plateNumber">
                  <vx-row-action icon="eye" (selected)="preview(vehicle)">View</vx-row-action>
                  <ng-container *vxCan="manage">
                    <vx-row-action icon="edit" (selected)="edit(vehicle)">Edit</vx-row-action>
                    @if (vehicle.status !== 'Maintenance') {
                      <vx-row-action icon="alert" (selected)="maintenance(vehicle)">
                        Send to maintenance
                      </vx-row-action>
                    }
                    @if (vehicle.status === 'Active') {
                      <vx-row-action icon="power" [danger]="true" (selected)="deactivate(vehicle)">
                        Deactivate
                      </vx-row-action>
                    } @else {
                      <vx-row-action icon="check" (selected)="activate(vehicle)">
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

    <vexto-vehicle-drawer
      [vehicle]="previewing()"
      [operations]="previewing() ? operationsFor(previewing()!.id) : null"
      [canManage]="canManage()"
      (closed)="previewing.set(null)"
      (edit)="editFromDrawer($event)"
    />

    <vexto-vehicle-form
      [open]="formOpen()"
      [vehicle]="editing()"
      (dismissed)="formOpen.set(false)"
      (saved)="onSaved()"
    />
  `,
})
export class VehiclesPage {
  private readonly api = inject(VehiclesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);

  protected readonly manage = VextoPermissions.Fleet.Manage;
  protected readonly label = humanizeEnum;

  protected readonly formOpen = signal(false);
  /** The vehicle the quick-view drawer is showing. Opening a card previews rather than edits. */
  protected readonly previewing = signal<VehicleResponse | null>(null);
  protected readonly canManage = computed(() => this.permissions.has(VextoPermissions.Fleet.Manage));
  protected readonly editing = signal<VehicleResponse | null>(null);

  private readonly preference = listViewPreference('vehicles');
  protected readonly layout = this.preference.view;

  /**
   * What each vehicle on the page is doing, fetched once per page.
   *
   * Asking per card would be the N+1 a fleet grid makes twenty times over; the endpoint answers the
   * whole page from the trip snapshots in one query.
   */
  private readonly operations = signal<ReadonlyMap<string, VehicleOperations>>(new Map());

  protected readonly list = new PagedList<VehicleResponse, VehicleFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        vehicleType: filters.vehicleType || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '', vehicleType: '' },
  );

  constructor() {
    // Lets the command palette’s “Create…” quick action land here with the form already open.
    openFormOnNewParam(() => this.add());

    // One batched request per page of results.
    effect(() => {
      const vehicles = this.list.items();

      if (vehicles.length === 0) {
        return;
      }

      this.api.operations(vehicles.map((vehicle) => vehicle.id)).subscribe({
        next: (rows) => this.operations.set(new Map(rows.map((row) => [row.vehicleId, row]))),

        // A failure here must not break the list: the cards simply show no assignment line.
        error: () => this.operations.set(new Map()),
      });
    });
  }

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  /**
   * What this vehicle is doing, or an explicit "nothing".
   *
   * The batch omits idle vehicles, so an absent row means available rather than unknown — and the
   * card needs to tell those apart to decide between "Available to assign" and no line at all.
   */
  protected operationsFor(vehicleId: string): VehicleOperations | null {
    if (this.operations().size === 0) {
      return null;
    }

    return (
      this.operations().get(vehicleId) ?? {
        vehicleId,
        activeTripId: null,
        activeRouteName: null,
        activeDriverName: null,
        nextTripId: null,
        nextRouteName: null,
        nextDepartureAtUtc: null,
      }
    );
  }

  /** Routes an overflow-menu choice to the same handlers the table rows use. */
  protected onCardAction(vehicle: VehicleResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      edit: () => this.edit(vehicle),
      activate: () => this.activate(vehicle),
      maintenance: () => this.maintenance(vehicle),
      deactivate: () => void this.deactivate(vehicle),
    };

    handlers[action]?.();
  }

  /** `Dubai A 12345` when a code exists, otherwise just the number. */
  protected plate(vehicle: VehicleResponse): string {
    return vehicle.plateCode ? `${vehicle.plateCode} ${vehicle.plateNumber}` : vehicle.plateNumber;
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected add(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  /** Opening a card previews it; editing is a deliberate second step from inside the drawer. */
  protected preview(vehicle: VehicleResponse): void {
    this.previewing.set(vehicle);
  }

  protected editFromDrawer(vehicle: VehicleResponse): void {
    this.previewing.set(null);
    this.edit(vehicle);
  }

  protected edit(vehicle: VehicleResponse): void {
    this.editing.set(vehicle);
    this.formOpen.set(true);
  }

  protected onSaved(): void {
    this.formOpen.set(false);
    this.list.refreshQuietly();
  }

  protected activate(vehicle: VehicleResponse): void {
    this.api.activate(vehicle.id).subscribe({
      next: () => {
        this.toast.success('Vehicle returned to service.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not activate this vehicle.'),
    });
  }

  protected maintenance(vehicle: VehicleResponse): void {
    this.api.sendToMaintenance(vehicle.id).subscribe({
      next: () => {
        this.toast.success('Vehicle marked as in maintenance.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not update this vehicle.'),
    });
  }

  protected async deactivate(vehicle: VehicleResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Deactivate vehicle?',
      message: `${vehicle.plateNumber} will no longer be assignable to routes or trips.`,
      confirmLabel: 'Deactivate',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.deactivate(vehicle.id).subscribe({
      next: () => {
        this.toast.success('Vehicle deactivated.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not deactivate this vehicle.'),
    });
  }
}
