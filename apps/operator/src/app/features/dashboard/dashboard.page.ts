import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardApi, TrackingApi, TripsApi } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type {
  ActiveFleetTrip,
  DashboardSummary,
  DashboardTripTrend,
  TripResponse,
} from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  VxAreaChart,
  VxBarChart,
  type VxChartPoint,
  VxEmptyState,
  VxIcon,
  VxMetricCard,
  VxProgressRing,
  VxSectionCard,
  VxSectionHeader,
  VxSkeletonCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/**
 * The operator's command centre.
 *
 * **Operational status first.** The top row is what a dispatcher needs before they have taken their
 * coat off — how many buses are out, how today's trips are going, and whether anything is stuck.
 * The people-and-fleet counts sit below it, because "how many drivers do we employ" is a question
 * for a Tuesday afternoon, not for 5am.
 *
 * **On data sources.** The tiles and the attendance ring come from `GET /api/v1/dashboard/summary`,
 * one request the backend answers in a fixed number of queries however large the operation is. The
 * trend chart comes from `GET /api/v1/dashboard/trip-trend`, a read model that returns at most
 * ninety rows of three numbers — the alternative would be shipping every trip in the window to the
 * browser to count them. Two further requests remain and neither is a count: a page of today's
 * trips, which three panels are derived from, and the active-fleet feed.
 *
 * **Nothing here is invented.** Every number, every trend point and every delta comes from the API.
 * A panel with no permission is not rendered at all rather than rendered empty, and a metric with
 * no comparison to make shows no delta rather than a fabricated percentage.
 */
@Component({
  selector: 'vexto-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VxAreaChart,
    VxBarChart,
    VxEmptyState,
    VxIcon,
    VxMetricCard,
    VxProgressRing,
    VxSectionCard,
    VxSectionHeader,
    VxSkeletonCard,
    VxStatusBadge,
  ],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {{ greeting() }}, {{ firstName() }}
        </h1>
        <p class="mt-1 text-body text-ink-muted">
          Here is how {{ tenantName() ?? 'your operation' }} is running today.
        </p>
      </div>

      @if (summary(); as today) {
        <span
          class="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-meta text-ink-secondary"
          style="background: var(--vexto-surface-muted)"
        >
          <vx-icon name="calendar" [size]="14" />
          Service date {{ today.serviceDate }}
        </span>
      }
    </header>

    @if (can(perms.Dashboard.View)) {
      <!-- Operational first. Live, running, waiting, stuck. -->
      <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <vx-metric-card
          label="Buses running"
          icon="live"
          accent="success"
          [loading]="loadingSummary()"
          [value]="running()"
          [context]="trackingContext()"
        />
        <vx-metric-card
          label="Today's trips"
          icon="trips"
          accent="primary"
          [loading]="loadingSummary()"
          [value]="todaysTripTotal()"
          [context]="completedContext()"
          [spark]="tripSpark()"
        />
        <vx-metric-card
          label="Boarded today"
          icon="check-circle"
          accent="info"
          [loading]="loadingSummary()"
          [value]="summary()?.attendance?.boarded ?? '—'"
          [context]="attendanceContext()"
          [spark]="boardingSpark()"
        />
        <vx-metric-card
          label="No-shows today"
          icon="alert"
          [accent]="(summary()?.attendance?.noShow ?? 0) > 0 ? 'warning' : 'neutral'"
          [loading]="loadingSummary()"
          [value]="summary()?.attendance?.noShow ?? '—'"
          [context]="skippedContext()"
        />
      </div>

      <div class="mb-6 grid gap-4 lg:grid-cols-3">
        <!-- The trend. Two weeks is enough to see a pattern and short enough to read the labels. -->
        <vx-section-card
          class="lg:col-span-2"
          title="Trips over the last two weeks"
          description="Scheduled journeys per service day, in your own time zone."
        >
          @if (loadingTrend()) {
            <div class="vx-skeleton h-[180px] w-full rounded-lg"></div>
          } @else if (tripTrendPoints().length === 0) {
            <vx-empty-state
              icon="trips"
              title="No trips yet"
              description="Once you generate trips from a route, the last two weeks will appear here."
            />
          } @else {
            <vx-area-chart [points]="tripTrendPoints()" unit="trips" />
          }
        </vx-section-card>

        <vx-section-card
          title="Attendance today"
          description="Everyone due to travel, and how the day is going."
        >
          @if (loadingSummary()) {
            <div class="vx-skeleton mx-auto size-28 rounded-full"></div>
          } @else if ((summary()?.attendance?.expected ?? 0) === 0) {
            <vx-empty-state
              icon="passengers"
              title="Nobody is due to travel"
              description="Attendance appears once today's trips carry passengers."
            />
          } @else {
            <div class="flex flex-col items-center gap-5">
              <vx-progress-ring
                label="Boarded"
                caption="boarded"
                tone="success"
                [value]="summary()!.attendance.boarded"
                [total]="summary()!.attendance.expected"
              />
              <vx-bar-chart
                class="w-full"
                [points]="attendanceBars()"
                [tones]="['success', 'warning', 'neutral']"
              />
            </div>
          }
        </vx-section-card>
      </div>

      <!-- People and fleet. Slower-moving, so it sits below the operational picture. -->
      <vx-section-header title="People and fleet" />
      <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @if (can(perms.Passengers.View)) {
          <vx-metric-card
            label="Active passengers"
            icon="passengers"
            accent="primary"
            [loading]="loadingSummary()"
            [value]="summary()?.activePassengers ?? '—'"
            context="Cleared to travel"
          />
        }
        @if (can(perms.Drivers.View)) {
          <vx-metric-card
            label="Active drivers"
            icon="drivers"
            accent="info"
            [loading]="loadingSummary()"
            [value]="summary()?.activeDrivers ?? '—'"
            context="Available to assign"
          />
        }
        @if (can(perms.Fleet.View)) {
          <vx-metric-card
            label="Active vehicles"
            icon="vehicle"
            accent="success"
            [loading]="loadingSummary()"
            [value]="summary()?.activeVehicles ?? '—'"
            context="In service"
          />
        }
        @if (can(perms.Routes.View)) {
          <vx-metric-card
            label="Active routes"
            icon="routes"
            accent="neutral"
            [loading]="loadingSummary()"
            [value]="summary()?.activeRoutes ?? '—'"
            context="Carrying passengers"
          />
        }
      </div>
    }

    @if (can(perms.Trips.View)) {
      <div class="grid gap-4 xl:grid-cols-2">
        <vx-section-card title="Running now" description="Trips under way, and how they are tracking.">
          @if (loadingTrips()) {
            <vx-skeleton-card [count]="2" [media]="false" />
          } @else if (inProgress().length === 0) {
            <vx-empty-state
              icon="live"
              title="No trips running"
              description="Trips appear here the moment a driver starts one."
            />
          } @else {
            <ul class="flex flex-col gap-2">
              @for (trip of inProgress(); track trip.id) {
                <li
                  class="flex items-center gap-3 rounded-xl border border-line p-3"
                  style="background: var(--vexto-surface-muted)"
                >
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-lg"
                    style="background: var(--vexto-success-soft); color: var(--vexto-success-text)"
                  >
                    <vx-icon name="live" [size]="17" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-body font-medium text-ink">{{ trip.route.name }}</p>
                    <p class="truncate text-meta text-ink-muted">
                      {{ time(trip.scheduledStartAtUtc) }} · {{ trip.passengerCount }} passengers
                    </p>
                  </div>
                  @if (trackingFor(trip.id); as tracking) {
                    <vx-status-badge [tone]="tracking.tone" [label]="tracking.label" />
                  }
                  <a class="vx-btn vx-btn-ghost vx-btn-sm" [routerLink]="['/trips', trip.id]">
                    Open
                  </a>
                </li>
              }
            </ul>
          }
        </vx-section-card>

        <vx-section-card title="Up next" description="The next departures on today's schedule.">
          @if (loadingTrips()) {
            <vx-skeleton-card [count]="3" [media]="false" />
          } @else if (upcoming().length === 0) {
            <vx-empty-state
              icon="calendar"
              title="Nothing else scheduled"
              description="Every trip for today has either run or been cancelled."
            />
          } @else {
            <ul class="flex flex-col">
              @for (trip of upcoming(); track trip.id) {
                <li
                  class="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-0"
                >
                  <span
                    class="w-14 flex-none text-body font-semibold tabular-nums text-ink"
                    >{{ time(trip.scheduledStartAtUtc) }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-body text-ink">{{ trip.route.name }}</p>
                    <p class="truncate text-meta text-ink-muted">
                      {{ trip.passengerCount }} passengers
                    </p>
                  </div>
                  <vx-status-badge [status]="trip.status" />
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
  protected readonly trend = signal<DashboardTripTrend | null>(null);
  protected readonly todaysTrips = signal<TripResponse[]>([]);
  protected readonly fleet = signal<ActiveFleetTrip[]>([]);
  protected readonly loadingSummary = signal(true);
  protected readonly loadingTrend = signal(true);
  protected readonly loadingTrips = signal(true);

  /** Every state a trip can be in today, so the tile agrees with the trend beneath it. */
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

  protected readonly running = computed(() => this.summary()?.today.startedTrips ?? '—');

  /**
   * How the running buses are reporting. Named rather than colour-only: "3 live, 1 stale" is the
   * sentence a dispatcher would say out loud.
   */
  protected readonly trackingContext = computed(() => {
    const tracking = this.summary()?.tracking;

    if (!tracking) {
      return null;
    }

    const parts: string[] = [];

    if (tracking.liveVehicles > 0) {
      parts.push(`${tracking.liveVehicles} live`);
    }

    if (tracking.staleVehicles > 0) {
      parts.push(`${tracking.staleVehicles} stale`);
    }

    if (tracking.offlineVehicles > 0) {
      parts.push(`${tracking.offlineVehicles} offline`);
    }

    return parts.length > 0 ? parts.join(' · ') : 'Nothing reporting';
  });

  protected readonly completedContext = computed(
    () => `${this.summary()?.today.completedTrips ?? 0} completed`,
  );

  protected readonly attendanceContext = computed(() => {
    const attendance = this.summary()?.attendance;

    return attendance ? `of ${attendance.expected} expected` : null;
  });

  protected readonly skippedContext = computed(() => {
    const skipped = this.summary()?.attendance.skipped ?? 0;

    return skipped > 0 ? `${skipped} declared an absence` : 'Nobody missed a pickup';
  });

  protected readonly tripTrendPoints = computed<VxChartPoint[]>(
    () =>
      this.trend()?.points.map((point) => ({
        label: this.shortDate(point.serviceDate),
        value: point.trips,
      })) ?? [],
  );

  /** The tile sparklines reuse the trend the chart already fetched; no extra request. */
  protected readonly tripSpark = computed(() =>
    (this.trend()?.points ?? []).map((point) => point.trips),
  );

  protected readonly boardingSpark = computed(() =>
    (this.trend()?.points ?? []).map((point) => point.boardedPassengers),
  );

  protected readonly attendanceBars = computed<VxChartPoint[]>(() => {
    const attendance = this.summary()?.attendance;

    if (!attendance) {
      return [];
    }

    return [
      { label: 'Boarded', value: attendance.boarded },
      { label: 'No-show', value: attendance.noShow },
      { label: 'Absent', value: attendance.skipped },
    ];
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

  constructor() {
    this.loadSummary();
    this.loadTrend();
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

  /** `2026-09-08` becomes `8 Sep`. The axis has room for a day, not for an ISO date. */
  private shortDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);

    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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

  private loadTrend(): void {
    if (!this.can(VextoPermissions.Dashboard.View)) {
      this.loadingTrend.set(false);

      return;
    }

    this.dashboardApi.tripTrend(14).subscribe({
      next: (trend) => {
        this.trend.set(trend);
        this.loadingTrend.set(false);
      },
      error: () => this.loadingTrend.set(false),
    });
  }

  private loadTrips(): void {
    if (!this.can(VextoPermissions.Trips.View)) {
      this.loadingTrips.set(false);

      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // One page of today's trips feeds both panels; the alternative is two filtered requests.
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
