import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { VehiclesApi } from '@vexto/api-client';
import type { VehicleResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
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
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { humanizeEnum } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';
import { VehicleForm } from './vehicle-form';

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
    VehicleForm,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header title="Vehicles" description="Your fleet, its capacity and its availability.">
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="add()">
        <vx-icon name="plus" [size]="16" />
        Add Vehicle
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

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'vehicle' : 'vehicles' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="7" />

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
                  <vx-row-action icon="eye" (selected)="edit(vehicle)">View</vx-row-action>
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
    </vx-table-shell>

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

  protected readonly manage = VextoPermissions.Fleet.Manage;
  protected readonly label = humanizeEnum;

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<VehicleResponse | null>(null);

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
