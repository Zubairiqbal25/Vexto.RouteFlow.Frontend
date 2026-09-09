import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardApi, PassengerBillingApi, TrackingApi, TripsApi } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type {
  AttentionItem,
  ActiveFleetTrip,
  BillingSummary,
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
import { formatMoney, formatRelative, formatTime, secondsSince, serviceDate } from '@vexto/utilities';
import {
  absencesCaption,
  activeDriversCaption,
  activePassengersCaption,
  activeRoutesCaption,
  activeVehiclesCaption,
  boardedCaption,
  totalTrips,
  trackingCaption,
  tripsCaption,
} from './dashboard-captions';
import { type DashboardSection, dashboardSections } from './dashboard-focus';
import { AttentionPanel } from './attention-panel';

/**
 * The operator's command centre.
 *
 * **One dashboard, ordered by what the signed-in account is for.** A dispatcher and a finance clerk
 * want the same facts in a different order, so the panels are shared and only the order changes —
 * see `dashboard-focus.ts`, which derives that order from the *permission set* rather than from a
 * role name, because operators invent their own role names and a screen keyed on
 * `role === 'Dispatcher'` quietly falls back to a generic layout for every customer who did.
 * Building four dashboards would mean fixing every bug four times.
 *
 * **On data sources.** The tiles and the attendance ring come from `GET /api/v1/dashboard/summary`,
 * one request the backend answers in a fixed number of queries however large the operation is. The
 * trend chart comes from `GET /api/v1/dashboard/trip-trend`, a read model that returns at most
 * ninety rows of three numbers — the alternative would be shipping every trip in the window to the
 * browser to count them. Three further requests remain and none is a count: a page of today's
 * trips, which two panels are derived from, the active-fleet feed, and — only for an account that
 * can see money — the billing summary.
 *
 * **Nothing here is invented.** Every number, every trend point and every delta comes from the API.
 * A panel with no permission is not rendered at all rather than rendered empty, and a metric with
 * no comparison to make shows no delta rather than a fabricated percentage.
 */
@Component({
  selector: 'vexto-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AttentionPanel,
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

    <!--
      A platform administrator holds no tenant, so the tenant summary below would be empty for them.
      Rather than showing four dashes, point them at the screen that is actually theirs.
    -->
    @if (focus() === 'platform') {
      <vx-section-card
        title="You are signed in as Vexto platform staff"
        description="Operational figures belong to an operator. Open the platform overview to see how the operators themselves are doing."
      >
        <a class="vx-btn vx-btn-primary" routerLink="/platform">
          <vx-icon name="shield" [size]="16" />
          Open platform overview
        </a>
      </vx-section-card>
    }

    @for (section of sections(); track section) {
      @switch (section) {
        <!-- Operational status: live, running, boarded, missed. --------------------------------- -->
        @case ('operations') {
          @if (can(perms.Dashboard.View)) {
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

            <!--
              Directly beneath the operational numbers, because it answers the same question they
              half answer: "what needs me now". Empty when nothing does, which is a real answer.
            -->
            <div class="mb-6">
              <vexto-attention-panel [items]="attention()" [loading]="loadingAttention()" />
            </div>
          }
        }

        <!-- Money. Leads for a finance account; near the bottom for everyone else. -------------- -->
        @case ('money') {
          @if (can(perms.Billing.View)) {
            <vx-section-header title="Billing" />
            <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <vx-metric-card
                label="Outstanding"
                icon="wallet"
                [accent]="(billing()?.outstandingAmount ?? 0) > 0 ? 'warning' : 'success'"
                [loading]="loadingBilling()"
                [value]="money(billing()?.outstandingAmount)"
                context="Across open invoices"
              />
              <vx-metric-card
                label="Open invoices"
                icon="card"
                accent="primary"
                [loading]="loadingBilling()"
                [value]="billing()?.openInvoiceCount ?? '—'"
                context="Not yet settled"
              />
              <vx-metric-card
                label="Collected this month"
                icon="trend-up"
                accent="success"
                [loading]="loadingBilling()"
                [value]="money(billing()?.collectedThisMonth)"
                context="Settled by the provider"
              />
              <vx-metric-card
                label="Failed payments"
                icon="alert"
                [accent]="(billing()?.failedPaymentCount ?? 0) > 0 ? 'danger' : 'neutral'"
                [loading]="loadingBilling()"
                [value]="billing()?.failedPaymentCount ?? '—'"
                context="Need a retry"
              />
            </div>
          }
        }

        <!-- Two-week trend. ------------------------------------------------------------------- -->
        @case ('trend') {
          @if (can(perms.Dashboard.View)) {
            <vx-section-card
              class="mb-6 block"
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
          }
        }

        <!-- Attendance today. ----------------------------------------------------------------- -->
        @case ('attendance') {
          @if (can(perms.Dashboard.View)) {
            <vx-section-card
              class="mb-6 block"
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
                    class="w-full max-w-md"
                    [points]="attendanceBars()"
                    [tones]="['success', 'warning', 'neutral']"
                  />
                </div>
              }
            </vx-section-card>
          }
        }

        <!-- People and fleet. Slower-moving, so it never leads. --------------------------------- -->
        @case ('fleet-counts') {
          @if (can(perms.Dashboard.View)) {
            <vx-section-header title="People and fleet" />
            <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              @if (can(perms.Passengers.View)) {
                <vx-metric-card
                  label="Active passengers"
                  icon="passengers"
                  accent="primary"
                  [loading]="loadingSummary()"
                  [value]="summary()?.activePassengers ?? '—'"
                  [context]="passengersContext()"
                />
              }
              @if (can(perms.Drivers.View)) {
                <vx-metric-card
                  label="Active drivers"
                  icon="drivers"
                  accent="info"
                  [loading]="loadingSummary()"
                  [value]="summary()?.activeDrivers ?? '—'"
                  [context]="driversContext()"
                />
              }
              @if (can(perms.Fleet.View)) {
                <vx-metric-card
                  label="Active vehicles"
                  icon="vehicle"
                  accent="success"
                  [loading]="loadingSummary()"
                  [value]="summary()?.activeVehicles ?? '—'"
                  [context]="vehiclesContext()"
                />
              }
              @if (can(perms.Routes.View)) {
                <vx-metric-card
                  label="Active routes"
                  icon="routes"
                  accent="neutral"
                  [loading]="loadingSummary()"
                  [value]="summary()?.activeRoutes ?? '—'"
                  [context]="routesContext()"
                />
              }
            </div>
          }
        }

        <!-- Running now. Leads for a dispatcher. ------------------------------------------------ -->
        @case ('running') {
          @if (can(perms.Trips.View)) {
            <vx-section-card
              class="mb-6 block"
              title="Running now"
              description="Trips under way, and how they are tracking."
            >
              @if (loadingTrips()) {
                <vx-skeleton-card [count]="2" [media]="false" />
              } @else if (inProgress().length === 0) {
                <vx-empty-state
                  icon="live"
                  title="No buses are currently reporting live location"
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
          }
        }

        <!-- Up next. ---------------------------------------------------------------------------- -->
        @case ('upcoming') {
          @if (can(perms.Trips.View)) {
            <vx-section-card
              class="mb-6 block"
              title="Up next"
              description="The next departures on today's schedule."
            >
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
                    <li class="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-0">
                      <span class="w-14 flex-none text-body font-semibold tabular-nums text-ink">
                        {{ time(trip.scheduledStartAtUtc) }}
                      </span>
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
          }
        }
      }
    }
  `,
})
export class DashboardPage {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly tripsApi = inject(TripsApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly billingApi = inject(PassengerBillingApi);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(AuthStore);

  private readonly layout = dashboardSections();

  protected readonly perms = VextoPermissions;
  protected readonly time = formatTime;
  protected readonly relative = formatRelative;

  /** What this account's dashboard leads with. Derived from permissions; see `dashboard-focus`. */
  protected readonly focus = this.layout.focus;
  protected readonly sections = this.layout.order;

  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');
  protected readonly tenantName = this.store.tenantName;

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly trend = signal<DashboardTripTrend | null>(null);
  protected readonly billing = signal<BillingSummary | null>(null);
  protected readonly todaysTrips = signal<TripResponse[]>([]);
  protected readonly fleet = signal<ActiveFleetTrip[]>([]);
  protected readonly attention = signal<readonly AttentionItem[]>([]);
  protected readonly loadingAttention = signal(true);

  protected readonly loadingSummary = signal(true);
  protected readonly loadingTrend = signal(true);
  protected readonly loadingTrips = signal(true);
  protected readonly loadingBilling = signal(true);

  /** Every state a trip can be in today, so the tile agrees with the trend beneath it. */
  protected readonly todaysTripTotal = computed(() => {
    const today = this.summary()?.today;

    if (!today) {
      return '—';
    }

    return totalTrips(today);
  });

  protected readonly running = computed(() => this.summary()?.today.startedTrips ?? '—');

  /**
   * The captions, every one derived from the value it sits beneath.
   *
   * The rules live in `dashboard-captions.ts` as pure functions with their own unit tests, because
   * a caption that can contradict its own number is a bug worth testing rather than a string worth
   * inlining.
   */
  protected readonly trackingContext = computed(() =>
    trackingCaption(this.summary()?.tracking, this.summary()?.today.startedTrips),
  );

  protected readonly completedContext = computed(() => tripsCaption(this.summary()?.today));

  protected readonly attendanceContext = computed(() => boardedCaption(this.summary()?.attendance));

  protected readonly skippedContext = computed(() => absencesCaption(this.summary()?.attendance));

  protected readonly passengersContext = computed(() =>
    activePassengersCaption(this.summary()?.activePassengers),
  );

  protected readonly driversContext = computed(() =>
    activeDriversCaption(this.summary()?.activeDrivers),
  );

  protected readonly vehiclesContext = computed(() =>
    activeVehiclesCaption(this.summary()?.activeVehicles),
  );

  protected readonly routesContext = computed(() =>
    activeRoutesCaption(this.summary()?.activeRoutes),
  );

  protected readonly tripTrendPoints = computed<VxChartPoint[]>(
    () =>
      this.trend()?.points.map((point) => ({
        label: this.shortDate(point.serviceDate),
        value: Number(point.trips),
      })) ?? [],
  );

  /** The tile sparklines reuse the trend the chart already fetched; no extra request. */
  protected readonly tripSpark = computed(() =>
    (this.trend()?.points ?? []).map((point) => Number(point.trips)),
  );

  protected readonly boardingSpark = computed(() =>
    (this.trend()?.points ?? []).map((point) => Number(point.boardedPassengers)),
  );

  protected readonly attendanceBars = computed<VxChartPoint[]>(() => {
    const attendance = this.summary()?.attendance;

    if (!attendance) {
      return [];
    }

    return [
      { label: 'Boarded', value: Number(attendance.boarded) },
      { label: 'No-show', value: Number(attendance.noShow) },
      { label: 'Absent', value: Number(attendance.skipped) },
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
    this.loadAttention();
    this.loadTrend();
    this.loadTrips();
    this.loadBilling();
  }

  protected can(permission: string): boolean {
    return this.permissions.has(permission);
  }

  protected greeting(): string {
    const hour = new Date().getHours();

    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  protected money(amount: number | string | null | undefined): string {
    return amount === null || amount === undefined
      ? '—'
      : formatMoney(Number(amount), this.billing()?.currency ?? 'AED');
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
    if (!this.can(VextoPermissions.Dashboard.View) || this.focus() === 'platform') {
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

  /**
   * The attention panel is a separate request from the summary on purpose: it answers a different
   * question, it is allowed to fail on its own, and a dashboard that lost its numbers because one
   * count timed out would be worse than one missing a panel.
   */
  private loadAttention(): void {
    if (!this.can(VextoPermissions.Dashboard.View) || this.focus() === 'platform') {
      this.loadingAttention.set(false);

      return;
    }

    this.dashboardApi.attention().subscribe({
      next: (response) => {
        this.attention.set(response.items);
        this.loadingAttention.set(false);
      },
      error: () => {
        this.attention.set([]);
        this.loadingAttention.set(false);
      },
    });
  }

  private loadTrend(): void {
    if (!this.can(VextoPermissions.Dashboard.View) || this.focus() === 'platform') {
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

  /** Only fetched for an account that can see money, and never for platform staff. */
  private loadBilling(): void {
    if (!this.can(VextoPermissions.Billing.View) || this.focus() === 'platform') {
      this.loadingBilling.set(false);

      return;
    }

    this.billingApi.summary().subscribe({
      next: (summary) => {
        this.billing.set(summary);
        this.loadingBilling.set(false);
      },
      error: () => this.loadingBilling.set(false),
    });
  }

  private loadTrips(): void {
    if (!this.can(VextoPermissions.Trips.View) || this.focus() === 'platform') {
      this.loadingTrips.set(false);

      return;
    }

    const today = serviceDate();

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

/** Re-exported so the page's tests can assert against the same union the layout uses. */
export type { DashboardSection };
