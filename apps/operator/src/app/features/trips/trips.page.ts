import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DriversApi, RoutesApi, TrackingApi, TripsApi, VehiclesApi } from '@vexto/api-client';
import type { ActiveFleetTrip, TripResponse } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxCardGrid,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  type VxFilterChip,
  VxFilterChips,
  VxPageHeader,
  VxPicker,
  type VxPickerOption,
  VxSectionHeader,
  VxSkeletonCard,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { formatDate, formatTime, secondsSince } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { TripDrawer } from './trip-drawer';
import { groupTrips } from './trip-board';
import { TripCard, type TripTracking } from './trip-card';

interface TripFilters extends Record<string, unknown> {
  search: string;
  serviceDate: string;
  status: string;
  routeId: string;
  driverId: string;
  vehicleId: string;
}

/**
 * The operations board.
 *
 * **A board, not a list.** A dispatcher's question is "what needs me now", and a table sorted by
 * date answers it only after they have read it. Trips are banded into Today, Tomorrow, Upcoming and
 * Earlier, and within today the running ones sort to the top — see `groupTrips`.
 *
 * The date filter is deliberately empty by default so the bands have something to band. The old
 * screen defaulted to today, which is right for a table and wrong for a board: it left every other
 * group permanently empty.
 *
 * A table is still offered, because comparing forty trips on one column is a real need and cards are
 * bad at it. The choice is remembered per screen.
 *
 * Tracking state is joined in from the active-fleet feed the dashboard already uses — one request
 * for the whole board rather than one per card.
 */
@Component({
  selector: 'vexto-trips-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TripCard,
    TripDrawer,
    VxCardGrid,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxFilterChips,
    VxPageHeader,
    VxPicker,
    VxSectionHeader,
    VxSkeletonCard,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header
      title="Trips"
      description="Today's operation, and everything scheduled around it."
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
        searchPlaceholder="Search route, driver or plate"
        searchLabel="Search trips"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <input
          filters
          type="date"
          class="vx-input w-auto"
          aria-label="Service date"
          [value]="list.filters().serviceDate"
          (change)="list.setFilter({ serviceDate: value($event) })"
        />

        <!--
          Searchable pickers rather than dropdowns, for the same reason as every other entity
          selector in the product: these were filled from the first fifty picker rows, so an
          operator with more routes than that could not filter by the rest — and the list ending
          looked exactly like the list being complete. See VxPicker.
        -->
        <div filters class="w-full sm:w-52">
          <vx-picker
            inputId="trip-filter-route"
            placeholder="All routes"
            emptyLabel="No routes yet."
            [limit]="20"
            [clearable]="true"
            [search]="searchRoutes"
            [selected]="route()"
            (chosen)="onRouteChosen($event)"
          />
        </div>

        <div filters class="w-full sm:w-52">
          <vx-picker
            inputId="trip-filter-driver"
            placeholder="All drivers"
            emptyLabel="No drivers yet."
            [limit]="20"
            [clearable]="true"
            [search]="searchDrivers"
            [selected]="driver()"
            (chosen)="onDriverChosen($event)"
          />
        </div>

        <div filters class="w-full sm:w-52">
          <vx-picker
            inputId="trip-filter-vehicle"
            placeholder="All vehicles"
            emptyLabel="No vehicles yet."
            [limit]="20"
            [clearable]="true"
            [search]="searchVehicles"
            [selected]="vehicle()"
            (chosen)="onVehicleChosen($event)"
          />
        </div>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'trip' : 'trips' }}
          </span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid><vx-skeleton-card [count]="6" [media]="false" /></vx-card-grid>
          </div>
        } @else {
          <vx-skeleton-table [columns]="7" />
        }
      </div>

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

      @if (layout() === 'cards') {
        <!-- The status chips filter what is already loaded rather than refetching: the board is one
             page, and a round trip to hide four cancelled trips is a round trip nobody asked for. -->
        <div class="mb-5">
          <vx-filter-chips
            label="Trip status"
            [chips]="statusChips()"
            [active]="activeChips()"
            (toggled)="toggleChip($event)"
            (cleared)="activeChips.set([])"
          />
        </div>

        @if (groups().length === 0) {
          <vx-empty-state
            icon="filter"
            title="Nothing matches those filters"
            description="Clear a status chip to see the rest of the board."
            actionLabel="Clear filters"
            (action)="activeChips.set([])"
          />
        }

        @for (group of groups(); track group.key) {
          <section class="mb-7 last:mb-0">
            <vx-section-header
              [title]="group.label"
              [description]="group.description"
            >
              <span class="text-meta text-ink-muted">
                {{ group.trips.length }} {{ group.trips.length === 1 ? 'trip' : 'trips' }}
              </span>
            </vx-section-header>

            <vx-card-grid>
              @for (trip of group.trips; track trip.id) {
                <vexto-trip-card
                  [trip]="trip"
                  [tracking]="trackingFor(trip)"
                  [selected]="inspected()?.id === trip.id"
                  (opened)="inspect(trip)"
                  (action)="onCardAction(trip, $event)"
                />
              }
            </vx-card-grid>
          </section>
        }
      } @else {
        <table class="vx-table">
          <thead>
            <tr>
              <th scope="col">Route</th>
              <th scope="col">Service date</th>
              <th scope="col">Departs</th>
              <th scope="col">Driver</th>
              <th scope="col">Vehicle</th>
              <th scope="col">Boarded</th>
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
                <td class="tabular-nums">
                  {{ trip.attendance.boarded + trip.attendance.droppedOff }} / {{ trip.passengerCount }}
                </td>
                <td><vx-status-badge [status]="trip.status" /></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </vx-table-shell>

    <vexto-trip-drawer
      [trip]="inspected()"
      [tracking]="inspected() ? trackingFor(inspected()!) : null"
      (closed)="inspected.set(null)"
      (openFull)="open($event)"
      (action)="onCardAction($event.trip, $event.action)"
    />
  `,
})
export class TripsPage {
  private readonly api = inject(TripsApi);
  private readonly routesApi = inject(RoutesApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly date = formatDate;
  protected readonly time = formatTime;

  private readonly preference = listViewPreference('trips');
  protected readonly layout = this.preference.view;

  protected readonly route = signal<VxPickerOption | null>(null);
  protected readonly driver = signal<VxPickerOption | null>(null);
  protected readonly vehicle = signal<VxPickerOption | null>(null);

  /**
   * Stable references, so the pickers' required inputs keep one identity across change detection
   * and the debounced search stream is not restarted on every render.
   */
  protected readonly searchRoutes = (term: string) =>
    this.routesApi.picker({ search: term || undefined });

  protected readonly searchDrivers = (term: string) =>
    this.driversApi.picker({ search: term || undefined });

  protected readonly searchVehicles = (term: string) =>
    this.vehiclesApi.picker({ search: term || undefined });
  protected readonly fleet = signal<ActiveFleetTrip[]>([]);

  /** The trip shown in the quick-view drawer. Null is the normal state. */
  protected readonly inspected = signal<TripResponse | null>(null);

  protected readonly activeChips = signal<readonly string[]>([]);

  protected readonly list = new PagedList<TripResponse, TripFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        serviceDate: filters.serviceDate || undefined,
        status: filters.status || undefined,
        routeId: filters.routeId || undefined,
        driverId: filters.driverId || undefined,
        vehicleId: filters.vehicleId || undefined,
        pageNumber: page,
        pageSize,
      }),
    {
      search: '',

      // Empty on purpose. The board bands by day, and pinning the query to today would leave
      // Tomorrow and Upcoming permanently empty — which is exactly what a board is for.
      serviceDate: '',
      status: '',
      routeId: '',
      driverId: '',
      vehicleId: '',
    },
  );

  protected readonly statusChips = computed<VxFilterChip[]>(() => {
    const counts = new Map<string, number>();

    for (const trip of this.list.items()) {
      counts.set(trip.status, (counts.get(trip.status) ?? 0) + 1);
    }

    return ['Started', 'Ready', 'Scheduled', 'Completed', 'Cancelled']
      .filter((status) => counts.has(status))
      .map((status) => ({ id: status, label: status, count: counts.get(status) ?? 0 }));
  });

  protected readonly groups = computed(() => {
    const active = this.activeChips();

    const filtered =
      active.length === 0
        ? this.list.items()
        : this.list.items().filter((trip) => active.includes(trip.status));

    return groupTrips(filtered);
  });

  protected onRouteChosen(option: VxPickerOption | null): void {
    this.route.set(option);
    this.list.setFilter({ routeId: option?.id ?? '' });
  }

  protected onDriverChosen(option: VxPickerOption | null): void {
    this.driver.set(option);
    this.list.setFilter({ driverId: option?.id ?? '' });
  }

  protected onVehicleChosen(option: VxPickerOption | null): void {
    this.vehicle.set(option);
    this.list.setFilter({ vehicleId: option?.id ?? '' });
  }

  constructor() {
    // Nothing is fetched here any more: each picker asks the server when it is opened, and most
    // visits to the board filter by nothing at all.

    // One feed for the whole board. Without it every card would have to ask whether its own bus is
    // reporting, which is the N+1 this page most easily falls into.
    if (this.permissions.has(VextoPermissions.Tracking.View)) {
      this.trackingApi.activeFleet().subscribe({
        next: (fleet) => this.fleet.set(fleet),
        error: () => this.fleet.set([]),
      });
    }
  }

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected toggleChip(id: string): void {
    this.activeChips.update((active) =>
      active.includes(id) ? active.filter((value) => value !== id) : [...active, id],
    );
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /**
   * Live, stale or offline — decided from the age of the last fix rather than from the label.
   *
   * A trip that has started and said nothing is `offline`, which is exactly the one a dispatcher
   * needs to notice. A trip that is not running has no tracking state at all, and shows no badge.
   */
  protected trackingFor(trip: TripResponse): TripTracking {
    if (trip.status !== 'Started') {
      return null;
    }

    const entry = this.fleet().find((candidate) => candidate.tripId === trip.id);
    const recordedAt = entry?.tracking.recordedAtUtc;

    if (!recordedAt) {
      return 'offline';
    }

    return secondsSince(recordedAt) <= 45 ? 'live' : 'stale';
  }

  protected inspect(trip: TripResponse): void {
    this.inspected.set(trip);
  }

  protected open(trip: TripResponse): void {
    this.inspected.set(null);
    void this.router.navigate(['/trips', trip.id]);
  }

  protected onCardAction(trip: TripResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      open: () => this.open(trip),
      crew: () => this.open(trip),
      cancel: () => void this.cancel(trip),
    };

    handlers[action]?.();
  }

  /**
   * Cancelling names the consequence rather than asking "are you sure".
   *
   * The number of people expecting the bus is the fact that decides whether this is routine or
   * serious, and it is the one thing a generic confirmation hides.
   */
  private async cancel(trip: TripResponse): Promise<void> {
    const expecting = trip.attendance.expected;

    const confirmed = await this.confirm.ask({
      title: 'Cancel this trip?',
      message:
        `${trip.route.name} at ${formatTime(trip.scheduledStartAtUtc)} will not run. ` +
        (expecting > 0
          ? `${expecting} ${expecting === 1 ? 'passenger is' : 'passengers are'} currently expected, and may be notified.`
          : 'Nobody is currently expected on it.'),
      confirmLabel: 'Cancel trip',
      cancelLabel: 'Keep trip',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.cancel(trip.id).subscribe({
      next: () => {
        this.toast.success('Trip cancelled.');
        this.inspected.set(null);
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not cancel this trip.'),
    });
  }
}
