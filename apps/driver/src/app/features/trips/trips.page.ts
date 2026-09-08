import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DriverApi, VextoApiError } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { DriverTrip } from '@vexto/models';
import { PushNotifications, VxPushToggle } from '@vexto/push';
import { VxEmptyState, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatTime } from '@vexto/utilities';

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
        <ul class="mt-5 flex flex-col gap-4">
          @for (trip of trips(); track trip.tripId) {
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
    </div>
  `,
})
export class DriverTripsPage {
  private readonly api = inject(DriverApi);

  private readonly store = inject(AuthStore);

  protected readonly time = formatTime;
  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');

  /** The trip that is running, if any. Null is the normal state for most of the day. */
  protected readonly running = computed(
    () => this.loaded().find((trip) => trip.status === 'Started') ?? null,
  );

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly loaded = signal<DriverTrip[]>([]);

  /** Running first, then by departure — the order a driver works through the day. */
  protected readonly trips = computed(() =>
    [...this.loaded()].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'Started') {
          return -1;
        }

        if (b.status === 'Started') {
          return 1;
        }
      }

      return a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc);
    }),
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

    this.api.myTrips({ serviceDate: new Date().toISOString().slice(0, 10), pageSize: 20 }).subscribe({
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
