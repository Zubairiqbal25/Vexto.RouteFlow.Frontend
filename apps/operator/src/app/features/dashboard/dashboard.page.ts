import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DriversApi,
  PassengersApi,
  TrackingApi,
  TripsApi,
  VehiclesApi,
} from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { ActiveFleetTrip, TripResponse } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  VxAvatar,
  VxEmptyState,
  VxIcon,
  VxSectionCard,
  VxSkeletonTable,
  VxStatCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/**
 * The operator's morning view.
 *
 * **On data sources.** The backend has no dashboard aggregate endpoint, so this page is assembled
 * from five requests, deliberately chosen: three counts (each a page-size-one list, read only for
 * its `totalCount`), one page of today's trips that every panel below is derived from, and the
 * active-fleet feed. It never issues a request per row.
 *
 * A `GET /api/v1/dashboard/summary` returning those counts plus today's trip breakdown would reduce
 * this to two calls; it is listed in the API gaps in docs/frontend-architecture.md.
 *
 * Panels the signed-in user has no permission for are not rendered at all, rather than rendered
 * empty — a dispatcher without fleet rights should not see an "Active Vehicles: —" tile.
 */
@Component({
  selector: 'vexto-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VxAvatar,
    VxEmptyState,
    VxIcon,
    VxSectionCard,
    VxSkeletonTable,
    VxStatCard,
    VxStatusBadge,
  ],
  template: `
    <header class="mb-6">
      <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {{ greeting() }}, {{ firstName() }}
      </h1>
      <p class="mt-1 text-body text-ink-muted">
        Here is how {{ tenantName() ?? 'your operation' }} is running today.
      </p>
    </header>

    <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      @if (can(perms.Passengers.View)) {
        <vx-stat-card
          label="Active Passengers"
          icon="passengers"
          accent="primary"
          [loading]="loadingCounts()"
          [value]="passengerCount()"
          context="Cleared to travel"
        />
      }
      @if (can(perms.Drivers.View)) {
        <vx-stat-card
          label="Active Drivers"
          icon="drivers"
          accent="info"
          [loading]="loadingCounts()"
          [value]="driverCount()"
          context="Available to assign"
        />
      }
      @if (can(perms.Fleet.View)) {
        <vx-stat-card
          label="Active Vehicles"
          icon="vehicle"
          accent="success"
          [loading]="loadingCounts()"
          [value]="vehicleCount()"
          context="In service"
        />
      }
      @if (can(perms.Trips.View)) {
        <vx-stat-card
          label="Today's Trips"
          icon="trips"
          accent="warning"
          [loading]="loadingTrips()"
          [value]="todaysTrips().length"
          [context]="completedContext()"
        />
      }
    </div>

    @if (can(perms.Trips.View)) {
      <div class="grid gap-5 xl:grid-cols-2">
        <vx-section-card
          title="Trips in progress"
          description="Vehicles currently running."
          [padded]="false"
        >
          <a header-actions routerLink="/trips" class="vx-btn vx-btn-ghost vx-btn-sm">
            View all
            <vx-icon name="chevron-right" [size]="15" />
          </a>

          @if (loadingTrips()) {
            <vx-skeleton-table [columns]="3" [rows]="3" />
          } @else if (inProgress().length === 0) {
            <vx-empty-state
              icon="live"
              title="Nothing running yet"
              description="Trips appear here once a driver starts them."
            />
          } @else {
            <div class="vx-table-scroll vx-scroll">
              <table class="vx-table">
                <thead>
                  <tr>
                    <th scope="col">Route</th>
                    <th scope="col">Driver</th>
                    <th scope="col">Started</th>
                    <th scope="col">Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  @for (trip of inProgress(); track trip.id) {
                    <tr>
                      <td>
                        <a class="vx-cell-strong hover:underline" [routerLink]="['/trips', trip.id]">
                          {{ trip.route.code }}
                        </a>
                        <span class="block truncate text-meta text-ink-muted">
                          {{ trip.route.name }}
                        </span>
                      </td>
                      <td>{{ trip.driver?.name ?? 'Unassigned' }}</td>
                      <td>{{ trip.actualStartAtUtc ? time(trip.actualStartAtUtc) : '—' }}</td>
                      <td>
                        @if (trackingFor(trip.id); as tracking) {
                          <vx-status-badge
                            [tone]="tracking.tone"
                            [label]="tracking.label"
                            [icon]="tracking.tone === 'success' ? 'signal' : 'signal-off'"
                          />
                        } @else {
                          <span class="text-ink-muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </vx-section-card>

        <vx-section-card
          title="Upcoming trips"
          description="Scheduled to depart later today."
          [padded]="false"
        >
          @if (loadingTrips()) {
            <vx-skeleton-table [columns]="3" [rows]="3" />
          } @else if (upcoming().length === 0) {
            <vx-empty-state
              icon="calendar"
              title="Nothing else today"
              description="Generate trips from a route's schedule to plan ahead."
            />
          } @else {
            <div class="vx-table-scroll vx-scroll">
              <table class="vx-table">
                <thead>
                  <tr>
                    <th scope="col">Departs</th>
                    <th scope="col">Route</th>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (trip of upcoming(); track trip.id) {
                    <tr>
                      <td class="vx-cell-strong">{{ time(trip.scheduledStartAtUtc) }}</td>
                      <td>
                        <a class="hover:underline" [routerLink]="['/trips', trip.id]">
                          {{ trip.route.code }}
                        </a>
                      </td>
                      <td>{{ trip.vehicle?.plateNumber ?? 'Unassigned' }}</td>
                      <td><vx-status-badge [status]="trip.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </vx-section-card>

        @if (can(perms.Tracking.View)) {
          <vx-section-card
            title="Fleet status"
            description="Where the running vehicles are reporting from."
            [padded]="false"
          >
            <a header-actions routerLink="/live-fleet" class="vx-btn vx-btn-ghost vx-btn-sm">
              Live Fleet
              <vx-icon name="chevron-right" [size]="15" />
            </a>

            @if (fleet().length === 0) {
              <vx-empty-state
                icon="live"
                title="No vehicles reporting"
                description="Positions appear once a driver starts a trip with location enabled."
              />
            } @else {
              <ul class="divide-y divide-line-subtle">
                @for (trip of fleet(); track trip.tripId) {
                  <li class="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div class="min-w-0">
                      <p class="font-medium text-ink">{{ trip.plateNumber ?? 'Unassigned' }}</p>
                      <p class="truncate text-meta text-ink-muted">
                        {{ trip.routeCode }} · {{ trip.driverName ?? 'No driver' }}
                      </p>
                    </div>
                    <div class="flex flex-none items-center gap-3">
                      <span class="text-meta text-ink-muted">
                        {{ trip.tracking.recordedAtUtc ? relative(trip.tracking.recordedAtUtc) : '—' }}
                      </span>
                      <vx-status-badge
                        [tone]="fleetTone(trip)"
                        [label]="fleetTone(trip) === 'success' ? 'Live' : 'Stale'"
                      />
                    </div>
                  </li>
                }
              </ul>
            }
          </vx-section-card>
        }

        <vx-section-card
          title="Recent activity"
          description="The last trips to finish."
          [padded]="false"
        >
          @if (loadingTrips()) {
            <vx-skeleton-table [columns]="3" [rows]="3" />
          } @else if (recent().length === 0) {
            <vx-empty-state
              icon="check-circle"
              title="Nothing completed yet"
              description="Finished trips are listed here with their attendance."
            />
          } @else {
            <ul class="divide-y divide-line-subtle">
              @for (trip of recent(); track trip.id) {
                <li class="flex items-center gap-3 px-5 py-3.5">
                  <vx-avatar size="sm" [name]="trip.driver?.name ?? trip.route.code" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-body text-ink">
                      <span class="font-medium">{{ trip.route.code }}</span>
                      completed with {{ trip.passengerCount }} passengers
                    </p>
                    <p class="text-meta text-ink-muted">
                      {{ trip.actualEndAtUtc ? relative(trip.actualEndAtUtc) : '' }}
                    </p>
                  </div>
                  <a class="vx-btn vx-btn-ghost vx-btn-sm" [routerLink]="['/trips', trip.id]">
                    Open
                  </a>
                </li>
              }
            </ul>
          }
        </vx-section-card>
      </div>
    }
  `,
})
export class DashboardPage {
  private readonly passengersApi = inject(PassengersApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly tripsApi = inject(TripsApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(AuthStore);

  protected readonly perms = VextoPermissions;
  protected readonly time = formatTime;
  protected readonly relative = formatRelative;

  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');
  protected readonly tenantName = this.store.tenantName;

  protected readonly passengerCount = signal<number | string>('—');
  protected readonly driverCount = signal<number | string>('—');
  protected readonly vehicleCount = signal<number | string>('—');
  protected readonly todaysTrips = signal<TripResponse[]>([]);
  protected readonly fleet = signal<ActiveFleetTrip[]>([]);
  protected readonly loadingCounts = signal(true);
  protected readonly loadingTrips = signal(true);

  protected readonly inProgress = computed(() =>
    this.todaysTrips().filter((trip) => trip.status === 'Started'),
  );

  protected readonly upcoming = computed(() =>
    this.todaysTrips()
      .filter((trip) => trip.status === 'Scheduled' || trip.status === 'Ready')
      .sort((a, b) => a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc))
      .slice(0, 6),
  );

  protected readonly recent = computed(() =>
    this.todaysTrips()
      .filter((trip) => trip.status === 'Completed')
      .sort((a, b) => (b.actualEndAtUtc ?? '').localeCompare(a.actualEndAtUtc ?? ''))
      .slice(0, 5),
  );

  protected readonly completedContext = computed(() => {
    const completed = this.todaysTrips().filter((trip) => trip.status === 'Completed').length;

    return `${completed} completed`;
  });

  constructor() {
    this.loadCounts();
    this.loadTrips();
  }

  protected can(permission: string): boolean {
    return this.permissions.has(permission);
  }

  protected greeting(): string {
    const hour = new Date().getHours();

    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  /** Live or stale, decided from the age of the fix rather than the label alone. */
  protected fleetTone(trip: ActiveFleetTrip): 'success' | 'warning' {
    return trip.tracking.recordedAtUtc && secondsSince(trip.tracking.recordedAtUtc) <= 45
      ? 'success'
      : 'warning';
  }

  protected trackingFor(tripId: string): { tone: 'success' | 'warning'; label: string } | null {
    const trip = this.fleet().find((candidate) => candidate.tripId === tripId);

    if (!trip) {
      return null;
    }

    const tone = this.fleetTone(trip);

    return { tone, label: tone === 'success' ? 'Live' : 'Stale' };
  }

  /**
   * Counts come from `totalCount` on a one-item page — the cheapest count the API offers, and the
   * reason each of these asks for `pageSize: 1`.
   */
  private loadCounts(): void {
    const pending: Promise<unknown>[] = [];

    if (this.can(VextoPermissions.Passengers.View)) {
      pending.push(
        new Promise((resolve) =>
          this.passengersApi.list({ status: 'Active', pageSize: 1 }).subscribe({
            next: (result) => {
              this.passengerCount.set(result.totalCount);
              resolve(null);
            },
            error: () => resolve(null),
          }),
        ),
      );
    }

    if (this.can(VextoPermissions.Drivers.View)) {
      pending.push(
        new Promise((resolve) =>
          this.driversApi.list({ status: 'Active', pageSize: 1 }).subscribe({
            next: (result) => {
              this.driverCount.set(result.totalCount);
              resolve(null);
            },
            error: () => resolve(null),
          }),
        ),
      );
    }

    if (this.can(VextoPermissions.Fleet.View)) {
      pending.push(
        new Promise((resolve) =>
          this.vehiclesApi.list({ status: 'Active', pageSize: 1 }).subscribe({
            next: (result) => {
              this.vehicleCount.set(result.totalCount);
              resolve(null);
            },
            error: () => resolve(null),
          }),
        ),
      );
    }

    void Promise.all(pending).then(() => this.loadingCounts.set(false));
  }

  private loadTrips(): void {
    if (!this.can(VextoPermissions.Trips.View)) {
      this.loadingTrips.set(false);

      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // One page of today's trips feeds three panels; the alternative is three filtered requests.
    this.tripsApi.list({ serviceDate: today, pageSize: 100 }).subscribe({
      next: (result) => {
        this.todaysTrips.set(result.items);
        this.loadingTrips.set(false);
      },
      error: () => this.loadingTrips.set(false),
    });

    if (this.can(VextoPermissions.Tracking.View)) {
      this.trackingApi.activeFleet().subscribe({
        next: (fleet) => this.fleet.set(fleet),
        error: () => this.fleet.set([]),
      });
    }
  }
}
