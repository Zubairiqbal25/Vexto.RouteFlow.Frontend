import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TripResponse } from '@vexto/models';
import { VxCardFact, VxEmptyState, VxIcon, VxSectionCard, VxStatusBadge } from '@vexto/ui';
import { formatDayLabel, formatTime } from '@vexto/utilities';
import { RouteWorkspaceStore } from './route-workspace.store';

/**
 * The trips this route is about to run.
 *
 * Compact cards, and deliberately only the next few. A route that has been running for a year has
 * hundreds of trips; downloading them to answer "when is the next one" is the kind of page that
 * takes four seconds to open and then tells you nothing you wanted. History lives on the Trips
 * board, which is built for filtering and paging.
 */
@Component({
  selector: 'vexto-route-trips-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxCardFact, VxEmptyState, VxIcon, VxSectionCard, VxStatusBadge],
  template: `
    <vx-section-card
      title="Upcoming trips"
      description="The next journeys generated from this route's schedule."
    >
      <a
        header-actions
        class="vx-btn vx-btn-ghost vx-btn-sm"
        [routerLink]="['/trips']"
        [queryParams]="{ routeId: routeId() }"
      >
        All trips
        <vx-icon name="chevron-right" [size]="15" />
      </a>

      @if (upcoming().length === 0) {
        <vx-empty-state
          icon="trips"
          title="No upcoming trips"
          description="Add a schedule, then use Generate trips to put this route on the road."
        />
      } @else {
        <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (trip of upcoming(); track trip.id) {
            <li class="vx-card flex flex-col gap-3 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-meta font-medium text-ink-muted">
                    {{ day(trip.scheduledStartAtUtc) }}
                  </p>
                  <p class="text-xl font-semibold tabular-nums tracking-tight text-ink">
                    {{ time(trip.scheduledStartAtUtc) }}
                  </p>
                </div>
                <vx-status-badge [status]="trip.status" />
              </div>

              <dl class="grid grid-cols-2 gap-3">
                <vx-card-fact label="Driver" [value]="trip.driver?.name ?? 'Unassigned'" />
                <vx-card-fact label="Vehicle" [value]="trip.vehicle?.plateNumber ?? 'Unassigned'" />
              </dl>

              <p class="flex items-center gap-1.5 text-meta text-ink-secondary">
                <vx-icon name="passengers" [size]="14" />
                {{ trip.passengerCount }}
                {{ passengerWord(trip) }}
              </p>

              <a class="vx-btn vx-btn-secondary vx-btn-sm" [routerLink]="['/trips', trip.id]">
                Open trip
              </a>
            </li>
          }
        </ul>
      }
    </vx-section-card>
  `,
})
export class RouteTripsTab {
  private readonly store = inject(RouteWorkspaceStore);

  protected readonly day = formatDayLabel;
  protected readonly time = formatTime;
  protected readonly upcoming = this.store.upcomingTrips;

  protected routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }

  protected passengerWord(trip: TripResponse): string {
    return Number(trip.passengerCount) === 1 ? 'passenger' : 'passengers';
  }
}
