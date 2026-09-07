import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardApi, TrackingApi, TripsApi } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { ActiveFleetTrip, DashboardSummary, TripResponse } from '@vexto/models';
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
 * **On data sources.** The tiles and the attendance strip come from
 * `GET /api/v1/dashboard/summary`, one request that the backend answers in a fixed number of
 * queries however large the operation is. This page used to assemble the same numbers from five
 * requests, one of which paged a hundred trips purely to count them.
 *
 * Two further requests remain, and they are not counts: a page of today's trips, which the three
 * panels below are all derived from, and the active-fleet feed the map-less fleet list needs. Both
 * return rows that are actually displayed.
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

    @if (can(perms.Dashboard.View)) {
      <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <vx-stat-card
          label="Active Passengers"
          icon="passengers"
          accent="primary"
          [loading]="loadingSummary()"
          [value]="summary()?.activePassengers ?? '—'"
          context="Cleared to travel"
        />
        <vx-stat-card
          label="Active Drivers"
          icon="drivers"
          accent="info"
          [loading]="loadingSummary()"
          [value]="summary()?.activeDrivers ?? '—'"
          context="Available to assign"
        />
        <vx-stat-card
          label="Active Vehicles"
          icon="vehicle"
          accent="success"
          [loading]="loadingSummary()"
          [value]="summary()?.activeVehicles ?? '—'"
          context="In service"
        />
        <vx-stat-card
          label="Today's Trips"
          icon="trips"
          accent="warning"
          [loading]="loadingSummary()"
          [value]="todaysTripTotal()"
          [context]="completedContext()"
        />
      </div>

      @if (summary(); as today) {
        <vx-section-card
          class="mb-6 block"
          title="Today at a glance"
          [description]="'Service date ' + today.serviceDate + ', in your own time zone.'"
        >
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            <div>
              <dt class="vx-section-label">Scheduled</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.today.scheduledTrips }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Running</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.today.startedTrips }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Completed</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.today.completedTrips }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Cancelled</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.today.cancelledTrips }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Boarded</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.attendance.boarded }} / {{ today.attendance.expected }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">No-shows</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-ink">
                {{ today.attendance.noShow }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Tracking</dt>
              <dd class="mt-1 flex flex-wrap items-center gap-1.5">
                <vx-status-badge tone="success" [label]="today.tracking.liveVehicles + ' live'" />
                @if (today.tracking.staleVehicles + today.tracking.offlineVehicles > 0) {
                  <vx-status-badge
                    tone="warning"
                    [label]="
                      today.tracking.staleVehicles + today.tracking.offlineVehicles + ' quiet'
                    "
                  />
                }
              </dd>
            </div>
          </dl>
        </vx-section-card>
      }
    }

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
  private readonly dashboardApi = inject(DashboardApi);
  private readonly tripsApi = inject(TripsApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(AuthStore);

  protected readonly perms = VextoPermissions;
  protected readonly time = formatTime;
  protected readonly relative = formatRelative;

  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');
  protected readonly tenantName = this.store.tenantName;

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly todaysTrips = signal<TripResponse[]>([]);
  protected readonly fleet = signal<ActiveFleetTrip[]>([]);
  protected readonly loadingSummary = signal(true);
  protected readonly loadingTrips = signal(true);

  /** Every state a trip can be in today, so the tile agrees with the strip beneath it. */
  protected readonly todaysTripTotal = computed(() => {
    const today = this.summary()?.today;

    if (!today) {
      return '—';
    }

    return (
      today.scheduledTrips +
      today.readyTrips +
      today.startedTrips +
      today.completedTrips +
      today.cancelledTrips
    );
  });

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

  protected readonly completedContext = computed(
    () => `${this.summary()?.today.completedTrips ?? 0} completed`,
  );

  constructor() {
    this.loadSummary();
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

  private loadSummary(): void {
    if (!this.can(VextoPermissions.Dashboard.View)) {
      this.loadingSummary.set(false);

      return;
    }

    this.dashboardApi.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loadingSummary.set(false);
      },
      error: () => this.loadingSummary.set(false),
    });
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
