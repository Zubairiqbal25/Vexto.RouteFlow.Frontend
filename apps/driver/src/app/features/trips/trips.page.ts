import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DriverApi, VextoApiError } from '@vexto/api-client';
import type { DriverTrip } from '@vexto/models';
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
  imports: [RouterLink, VxEmptyState, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <h1 class="text-lg font-semibold tracking-tight text-ink">Today's trips</h1>
      <p class="mt-1 text-body text-ink-muted">{{ today() }}</p>

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

  protected readonly time = formatTime;

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
  }

  protected today(): string {
    return formatDate(new Date());
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
