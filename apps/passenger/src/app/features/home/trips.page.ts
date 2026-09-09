import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PassengerSelfApi, VextoApiError } from '@vexto/api-client';
import type { PassengerTrip } from '@vexto/models';
import { VxEmptyState, VxErrorState, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatTime, serviceDate } from '@vexto/utilities';

/** The passenger's own schedule, grouped by nothing and sorted by when the bus leaves. */
@Component({
  selector: 'vexto-passenger-trips-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxEmptyState, VxErrorState, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <h1 class="text-lg font-semibold tracking-tight text-ink">Your trips</h1>
      <p class="mt-1 text-body text-ink-muted">Everything scheduled for you from today.</p>

      @if (loading()) {
        <div class="mt-5 flex flex-col gap-3">
          @for (row of [0, 1, 2]; track row) {
            <vx-skeleton height="5.5rem" />
          }
        </div>
      } @else if (error(); as message) {
        <vx-error-state title="We could not load your trips" [message]="message" (retry)="load()" />
      } @else if (trips().length === 0) {
        <vx-empty-state
          icon="trips"
          title="Nothing scheduled"
          description="Your transport operator has not scheduled any upcoming trips for you."
        />
      } @else {
        <ul class="mt-5 flex flex-col gap-3">
          @for (trip of trips(); track trip.tripId) {
            <li class="vx-card p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-semibold text-ink">{{ trip.routeName }}</p>
                  <p class="mt-0.5 text-meta text-ink-muted">
                    {{ date(trip.serviceDate) }} · {{ trip.stopName ?? 'Your usual stop' }}
                  </p>
                </div>
                <p class="flex-none text-lg font-semibold text-ink">
                  {{ time(trip.scheduledStartAtUtc) }}
                </p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <vx-status-badge [status]="trip.tripStatus" />
                <vx-status-badge [status]="trip.myStatus" />
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class PassengerTripsPage {
  private readonly api = inject(PassengerSelfApi);

  protected readonly date = formatDate;
  protected readonly time = formatTime;

  protected readonly trips = signal<PassengerTrip[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.myTrips({ fromDate: serviceDate(), pageSize: 25 }).subscribe({
      next: (result) => {
        this.trips.set(
          [...result.items].sort((a, b) =>
            a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc),
          ),
        );
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
