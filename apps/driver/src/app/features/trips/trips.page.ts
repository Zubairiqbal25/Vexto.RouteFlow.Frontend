import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DriverApi, VextoApiError } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { DriverTrip } from '@vexto/models';
import { PushNotifications, VxPushToggle } from '@vexto/push';
import { VxEmptyState, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatDayLabel, formatTime, serviceDate } from '@vexto/utilities';

/** How much of a trip is still the driver's problem, lowest first. */
function remaining(trip: DriverTrip): number {
  if (trip.status === 'Started') {
    return 0;
  }

  return trip.status === 'Completed' || trip.status === 'Cancelled' ? 2 : 1;
}

/**
 * The driver's day, as a short list of large cards.
 *
 * No table, no filters, no pagination: a driver has two or three trips, is standing beside a bus,
 * and needs the next one to be unmissable. The card for the trip that is running is pulled to the
 * top and marked, because that is the only one they can act on right now.
 */
@Component({
  selector: 'vexto-driver-trips-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxEmptyState, VxErrorState, VxIcon, VxPushToggle, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4 sm:p-6">
      <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {{ greeting() }}, {{ firstName() }}
      </h1>
      <p class="mt-1 text-body text-ink-muted">{{ today() }}</p>

      @if (running(); as active) {
        <!-- The one trip the driver can act on right now, lifted out of the list entirely. On a
             tablet propped on a dashboard this is the only thing that needs to be readable. -->
        <a
          class="mt-5 flex items-center gap-4 rounded-2xl p-5 text-white shadow-raised"
          style="background: linear-gradient(135deg, var(--vexto-primary) 0%, var(--vexto-primary-active) 100%)"
          [routerLink]="['/trips', active.tripId]"
        >
          <span
            class="flex size-12 flex-none items-center justify-center rounded-xl"
            style="background: rgb(255 255 255 / 18%)"
          >
            <vx-icon name="live" [size]="24" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[0.6875rem] font-semibold uppercase tracking-wider opacity-80">
              Trip in progress
            </span>
            <span class="mt-0.5 block truncate text-base font-semibold">{{ active.routeName }}</span>
            <span class="block truncate text-meta opacity-85">
              {{ time(active.scheduledStartAtUtc) }} · {{ active.passengerCount }} passengers
            </span>
          </span>
          <vx-icon name="chevron-right" [size]="22" />
        </a>
      }


      @if (!running() && nextTrip(); as next) {
        <!--
          The one question a driver opens this app to ask. Before a trip is running the answer is
          not "here is a list" — it is this trip, this bus, this many people, and the button that
          starts it. The list underneath is for the rest of the day.
        -->
        <section
          class="mt-5 rounded-2xl p-6 text-white shadow-raised"
          style="background: linear-gradient(135deg, var(--vexto-primary) 0%, var(--vexto-primary-active) 100%)"
          aria-labelledby="next-trip-heading"
        >
          <p
            id="next-trip-heading"
            class="text-[0.6875rem] font-semibold uppercase tracking-wider opacity-80"
          >
            Next trip
          </p>
          <p class="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
            {{ time(next.scheduledStartAtUtc) }}
          </p>
          <p class="mt-1 text-lg font-semibold">{{ next.routeName }}</p>
          <p class="mt-0.5 text-body opacity-85">
            {{ next.routeCode }} · {{ day(next.scheduledStartAtUtc) }}
          </p>

          <dl class="mt-5 grid grid-cols-2 gap-4">
            <div>
              <dt class="text-[0.6875rem] font-semibold uppercase tracking-wider opacity-80">
                Vehicle
              </dt>
              <dd class="mt-0.5 truncate text-body font-semibold">
                {{ next.vehiclePlateNumber ?? "Not assigned" }}
              </dd>
            </div>
            <div>
              <dt class="text-[0.6875rem] font-semibold uppercase tracking-wider opacity-80">
                Passengers
              </dt>
              <dd class="mt-0.5 text-body font-semibold tabular-nums">{{ next.passengerCount }}</dd>
            </div>
          </dl>

          <a
            class="vx-btn vx-btn-touch mt-6 w-full text-lg font-semibold"
            style="background: #fff; color: var(--vexto-primary-active)"
            [routerLink]="['/trips', next.tripId]"
          >
            START TRIP
          </a>
        </section>
      }

      <!--
        Offered here rather than mid-trip: a driver about to set off has a moment to decide, and one
        halfway through a route does not. Renders nothing when push is unconfigured or unsupported.
      -->
      <div class="mt-4">
        <vx-push-toggle />
      </div>

      @if (loading()) {
        <div class="mt-5 flex flex-col gap-4">
          @for (row of [0, 1]; track row) {
            <vx-skeleton height="8rem" />
          }
        </div>
      } @else if (error(); as message) {
        <vx-error-state title="We could not load your trips" [message]="message" (retry)="load()" />
      } @else if (trips().length === 0) {
        <vx-empty-state
          icon="trips"
          title="No trips today"
          description="When your dispatcher assigns you a trip it will appear here."
        />
      } @else {
        @if (listedTrips().length > 0) {
          @if (!running() && nextTrip()) {
            <h2 class="mt-8 text-base font-semibold text-ink">Rest of the day</h2>
          }

          <ul class="mt-5 flex flex-col gap-4">
          @for (trip of listedTrips(); track trip.tripId) {
            <li>
              <a
                class="vx-card block p-5 active:bg-surface-hover"
                [class.shadow-raised]="trip.status === 'Started'"
                [style.border-color]="trip.status === 'Started' ? 'var(--vexto-primary)' : null"
                [routerLink]="['/trips', trip.tripId]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-base font-semibold text-ink">{{ trip.routeName }}</p>
                    <p class="mt-0.5 text-meta text-ink-muted">{{ trip.routeCode }}</p>
                  </div>
                  <vx-status-badge [status]="trip.status" />
                </div>

                <dl class="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <dt class="vx-section-label">Departs</dt>
                    <dd class="mt-0.5 text-body font-semibold text-ink">
                      {{ time(trip.scheduledStartAtUtc) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Vehicle</dt>
                    <dd class="mt-0.5 truncate text-body font-semibold text-ink">
                      {{ trip.vehiclePlateNumber ?? '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Passengers</dt>
                    <dd class="mt-0.5 text-body font-semibold text-ink">{{ trip.passengerCount }}</dd>
                  </div>
                </dl>

                <p class="mt-4 flex items-center gap-1.5 text-body font-medium text-primary">
                  {{ trip.status === 'Started' ? 'Continue trip' : 'Open trip' }}
                  <vx-icon name="chevron-right" [size]="16" />
                </p>
              </a>
            </li>
          }
          </ul>
        }
      }
    </div>
  `,
})
export class DriverTripsPage {
  private readonly api = inject(DriverApi);

  private readonly store = inject(AuthStore);

  protected readonly time = formatTime;
  protected readonly day = formatDayLabel;
  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');

  /** The trip that is running, if any. Null is the normal state for most of the day. */
  protected readonly running = computed(
    () => this.loaded().find((trip) => trip.status === 'Started') ?? null,
  );

  /**
   * The trip the driver drives next: the soonest one not yet run.
   *
   * Only meaningful when nothing is running — a driver mid-route is not choosing what to do next.
   */
  protected readonly nextTrip = computed(
    () =>
      this.trips().find((trip) => trip.status === 'Scheduled' || trip.status === 'Ready') ?? null,
  );

  /** Everything except the trip already shown as the hero, so the same card is not on screen twice. */
  protected readonly listedTrips = computed(() => {
    const hero = this.running() ? null : this.nextTrip();

    return this.trips().filter((trip) => trip.tripId !== hero?.tripId);
  });

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly loaded = signal<DriverTrip[]>([]);

  /** Running first, then by departure — the order a driver works through the day. */
  /**
   * The driver's day, ordered by what is left to do.
   *
   * Running first, then still to run, then finished — and departure time only *within* each band.
   * Sorting on departure across the whole list interleaves this morning's completed runs with the
   * afternoon's, so by mid-shift the next thing a driver has to do is several cards down a list of
   * work they have already finished.
   */
  protected readonly trips = computed(() =>
    [...this.loaded()].sort(
      (a, b) =>
        remaining(a) - remaining(b) || a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc),
    ),
  );

  constructor() {
    this.load();

    // Re-registers an already-permitted device, because Firebase rotates tokens on its own
    // schedule. Asks the browser for nothing, so no prompt is ever fired on load.
    void inject(PushNotifications).refresh();
  }

  protected today(): string {
    return formatDate(new Date());
  }

  protected greeting(): string {
    const hour = new Date().getHours();

    // Drivers start before dawn far more often than office staff, so the morning window is wide.
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    // The operator's business day, not the UTC one: a driver starting at 05:00 in Dubai would
    // otherwise be shown yesterday's roster. See serviceDate.
    this.api.myTrips({ serviceDate: serviceDate(), pageSize: 20 }).subscribe({
      next: (result) => {
        this.loaded.set(result.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load your trips.',
        );
      },
    });
  }
}
