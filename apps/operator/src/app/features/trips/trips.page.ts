import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DriversApi, RoutesApi, TripsApi, VehiclesApi } from '@vexto/api-client';
import type { DriverResponse, RouteResponse, TripResponse, VehicleResponse } from '@vexto/models';
import {
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxPageHeader,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatDate, formatTime } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface TripFilters extends Record<string, unknown> {
  serviceDate: string;
  status: string;
  routeId: string;
  driverId: string;
  vehicleId: string;
}

/**
 * The operational view of the day.
 *
 * Defaults to today, because that is what a dispatcher opens this page for. The filter row is
 * wider than on other list screens for the same reason: narrowing to one route or one driver is the
 * normal way this page is used, not an advanced feature.
 *
 * The route, driver and vehicle pickers are loaded once here rather than per row — the alternative
 * is a request per trip, which is precisely the N+1 to avoid on a page that lists a hundred trips.
 */
@Component({
  selector: 'vexto-trips-page',
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
    <vx-page-header title="Trips" description="Today's operation, and everything scheduled around it." />

    <vx-table-shell
      [loading]="list.loading()"
      [error]="list.error()"
      [isEmpty]="list.isEmpty()"
      [page]="list.page()"
      [pageSize]="list.pageSize"
      [totalCount]="list.total()"
      (pageChange)="list.setPage($event)"
    >
      <!-- The trips endpoint has no free-text search, so the box is hidden rather than inert. -->
      <vx-filter-bar toolbar [showSearch]="false">
        <input
          filters
          type="date"
          class="vx-input w-auto"
          aria-label="Service date"
          [value]="list.filters().serviceDate"
          (change)="list.setFilter({ serviceDate: value($event) })"
        />

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Ready">Ready</option>
          <option value="Started">Started</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by route"
          (change)="list.setFilter({ routeId: value($event) })"
        >
          <option value="">All routes</option>
          @for (route of routes(); track route.id) {
            <option [value]="route.id">{{ route.code }}</option>
          }
        </select>

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by driver"
          (change)="list.setFilter({ driverId: value($event) })"
        >
          <option value="">All drivers</option>
          @for (driver of drivers(); track driver.id) {
            <option [value]="driver.id">{{ driver.firstName }} {{ driver.lastName }}</option>
          }
        </select>

        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by vehicle"
          (change)="list.setFilter({ vehicleId: value($event) })"
        >
          <option value="">All vehicles</option>
          @for (vehicle of vehicles(); track vehicle.id) {
            <option [value]="vehicle.id">{{ vehicle.plateNumber }}</option>
          }
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'trip' : 'trips' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="7" />

      <vx-error-state
        error
        title="We could not load trips"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="trips"
        title="No trips for this view"
        description="Change the date or clear the filters. Trips are created from a route's schedule."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Route</th>
            <th scope="col">Service date</th>
            <th scope="col">Departs</th>
            <th scope="col">Driver</th>
            <th scope="col">Vehicle</th>
            <th scope="col">Passengers</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (trip of list.items(); track trip.id) {
            <tr class="cursor-pointer" (click)="open(trip)">
              <td>
                <span class="vx-cell-strong block">{{ trip.route.code }}</span>
                <span class="block truncate text-meta text-ink-muted">{{ trip.route.name }}</span>
              </td>
              <td>{{ date(trip.serviceDate) }}</td>
              <td>
                {{ time(trip.scheduledStartAtUtc) }}
                @if (trip.actualStartAtUtc) {
                  <span class="block text-meta text-ink-muted">
                    Started {{ time(trip.actualStartAtUtc) }}
                  </span>
                }
              </td>
              <td>{{ trip.driver?.name ?? 'Unassigned' }}</td>
              <td>{{ trip.vehicle?.plateNumber ?? 'Unassigned' }}</td>
              <td>{{ trip.passengerCount }}</td>
              <td><vx-status-badge [status]="trip.status" /></td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>
  `,
})
export class TripsPage {
  private readonly api = inject(TripsApi);
  private readonly routesApi = inject(RoutesApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly router = inject(Router);

  protected readonly date = formatDate;
  protected readonly time = formatTime;

  protected readonly routes = signal<RouteResponse[]>([]);
  protected readonly drivers = signal<DriverResponse[]>([]);
  protected readonly vehicles = signal<VehicleResponse[]>([]);

  protected readonly list = new PagedList<TripResponse, TripFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        serviceDate: filters.serviceDate || undefined,
        status: filters.status || undefined,
        routeId: filters.routeId || undefined,
        driverId: filters.driverId || undefined,
        vehicleId: filters.vehicleId || undefined,
        pageNumber: page,
        pageSize,
      }),
    {
      serviceDate: new Date().toISOString().slice(0, 10),
      status: '',
      routeId: '',
      driverId: '',
      vehicleId: '',
    },
  );

  constructor() {
    this.routesApi.list({ pageSize: 100 }).subscribe({
      next: (result) => this.routes.set(result.items),
      error: () => this.routes.set([]),
    });

    this.driversApi.list({ status: 'Active', pageSize: 100 }).subscribe({
      next: (result) => this.drivers.set(result.items),
      error: () => this.drivers.set([]),
    });

    this.vehiclesApi.list({ status: 'Active', pageSize: 100 }).subscribe({
      next: (result) => this.vehicles.set(result.items),
      error: () => this.vehicles.set([]),
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected open(trip: TripResponse): void {
    void this.router.navigate(['/trips', trip.id]);
  }
}
