import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TrackingApi, VextoApiError } from '@vexto/api-client';
import { VxMap, type VxMapMarker } from '@vexto/maps';
import type { ActiveFleetTrip } from '@vexto/models';
import { TrackingHub } from '@vexto/signalr';
import { VxEmptyState, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge } from '@vexto/ui';
import { VEXTO_CONFIG, formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/**
 * Where every bus is, right now.
 *
 * One HTTP call establishes the picture; SignalR keeps it moving. Positions are merged into the
 * existing rows rather than triggering a refetch — a refetch per update would be a request every
 * few seconds per vehicle.
 *
 * "Live" is decided from the age of the last fix, not only from the server's label: a connection
 * that quietly died leaves a status of `Live` attached to a position that is minutes old, and a
 * dispatcher acting on that is the failure this guards against.
 */
@Component({
  selector: 'vexto-live-fleet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxEmptyState, VxErrorState, VxIcon, VxMap, VxSkeleton, VxStatusBadge],
  template: `
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Live Fleet</h1>
        <p class="mt-1 text-body text-ink-muted">
          Vehicles currently on the road, updated as their drivers report position.
        </p>
      </div>

      <span class="vx-badge" [class]="'vx-tone-' + connectionTone()">
        <vx-icon [name]="connected() ? 'signal' : 'signal-off'" [size]="14" />
        {{ connectionLabel() }}
      </span>
    </div>

    @if (error(); as message) {
      <vx-error-state title="We could not load the fleet" [message]="message" (retry)="load()" />
    } @else {
      <div class="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div class="vx-card overflow-hidden" style="min-height: 34rem">
          <vx-map
            class="block size-full"
            [markers]="markers()"
            [center]="focusPoint()"
            (markerSelected)="select($event)"
          />
        </div>

        <aside class="vx-card flex max-h-[34rem] flex-col overflow-hidden">
          <div class="vx-card-header">
            <div>
              <h2 class="vx-card-title">On the road</h2>
              <p class="mt-0.5 text-meta text-ink-muted">
                {{ trips().length }} {{ trips().length === 1 ? 'vehicle' : 'vehicles' }}
              </p>
            </div>
          </div>

          @if (loading()) {
            <div class="flex flex-col gap-3 p-5">
              @for (row of [0, 1, 2, 3]; track row) {
                <vx-skeleton height="3.5rem" />
              }
            </div>
          } @else if (trips().length === 0) {
            <vx-empty-state
              icon="live"
              title="Nothing running"
              description="Vehicles appear here once a driver starts their trip."
            />
          } @else {
            <ul class="vx-scroll flex-1 divide-y divide-line-subtle overflow-y-auto">
              @for (trip of trips(); track trip.tripId) {
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-col gap-1.5 px-5 py-4 text-start hover:bg-surface-hover"
                    [style.background]="
                      trip.tripId === selected() ? 'var(--vexto-primary-50)' : null
                    "
                    [attr.aria-current]="trip.tripId === selected()"
                    (click)="select(trip.tripId)"
                  >
                    <span class="flex items-center justify-between gap-3">
                      <span class="font-medium text-ink">
                        {{ trip.plateNumber ?? 'Unassigned vehicle' }}
                      </span>
                      <vx-status-badge
                        [tone]="tone(trip)"
                        [label]="label(trip)"
                        [icon]="tone(trip) === 'success' ? 'signal' : 'signal-off'"
                      />
                    </span>
                    <span class="text-meta text-ink-muted">
                      {{ trip.routeCode }} · {{ trip.routeName }}
                    </span>
                    <span class="text-meta text-ink-muted">
                      {{ trip.driverName ?? 'No driver' }} ·
                      {{
                        trip.tracking.recordedAtUtc
                          ? relative(trip.tracking.recordedAtUtc)
                          : 'no position yet'
                      }}
                    </span>
                  </button>
                </li>
              }
            </ul>

            @if (selectedTrip(); as trip) {
              <div class="border-t border-line-subtle p-5">
                <p class="vx-section-label">Selected</p>
                <p class="mt-1 font-medium text-ink">{{ trip.routeName }}</p>
                <p class="text-meta text-ink-muted">
                  Departed {{ trip.tracking.recordedAtUtc ? time(trip.tracking.recordedAtUtc) : '—' }}
                </p>
                <button
                  type="button"
                  class="vx-btn vx-btn-secondary vx-btn-sm mt-3 w-full"
                  (click)="openTrip(trip)"
                >
                  Open trip
                </button>
              </div>
            }
          }
        </aside>
      </div>
    }
  `,
})
export class LiveFleetPage {
  private readonly api = inject(TrackingApi);
  private readonly hub = inject(TrackingHub);
  private readonly router = inject(Router);
  private readonly staleAfter = inject(VEXTO_CONFIG).staleLocationAfterSeconds;

  protected readonly relative = formatRelative;
  protected readonly time = formatTime;

  protected readonly trips = signal<ActiveFleetTrip[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<string | null>(null);

  protected readonly connected = computed(() => this.hub.status() === 'connected');

  protected readonly connectionLabel = computed(
    () =>
      ({
        connected: 'Connected',
        connecting: 'Connecting…',
        reconnecting: 'Reconnecting…',
        disconnected: 'Offline',
      })[this.hub.status()],
  );

  protected readonly connectionTone = computed(
    () =>
      ({
        connected: 'success',
        connecting: 'warning',
        reconnecting: 'warning',
        disconnected: 'danger',
      })[this.hub.status()],
  );

  protected readonly selectedTrip = computed(
    () => this.trips().find((trip) => trip.tripId === this.selected()) ?? null,
  );

  /** Clicking a row re-centres the map; clicking a pin only highlights, so the view stays put. */
  protected readonly focusPoint = signal<{ lat: number; lng: number } | null>(null);

  protected readonly markers = computed<VxMapMarker[]>(() =>
    this.trips()
      .filter(
        (trip): trip is ActiveFleetTrip & { tracking: { latitude: number; longitude: number } } =>
          trip.tracking.latitude !== null && trip.tracking.longitude !== null,
      )
      .map((trip) => ({
        id: trip.tripId,
        lat: trip.tracking.latitude,
        lng: trip.tracking.longitude,
        label: `${trip.plateNumber ?? 'Vehicle'} · ${trip.routeCode}`,
        tone: this.tone(trip) === 'success' ? 'success' : 'warning',
        heading: trip.tracking.headingDegrees,
        selected: trip.tripId === this.selected(),
      })),
  );

  constructor() {
    this.load();
    void this.hub.start();

    this.hub.updates.pipe(takeUntilDestroyed()).subscribe((update) => {
      this.trips.update((current) =>
        current.map((trip) =>
          trip.tripId === update.tripId
            ? {
                ...trip,
                tracking: {
                  ...trip.tracking,
                  latitude: update.latitude,
                  longitude: update.longitude,
                  speedKph: update.speedKph,
                  headingDegrees: update.headingDegrees,
                  recordedAtUtc: update.recordedAtUtc,
                  trackingStatus: update.trackingStatus,
                },
              }
            : trip,
        ),
      );

      // A trip that starts while the page is open is not in the list yet; refresh to pick it up.
      if (!this.trips().some((trip) => trip.tripId === update.tripId)) {
        this.load();
      }
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.activeFleet().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load the live fleet.',
        );
      },
    });
  }

  protected tone(trip: ActiveFleetTrip): 'success' | 'warning' | 'neutral' {
    if (!trip.tracking.recordedAtUtc) {
      return 'neutral';
    }

    return secondsSince(trip.tracking.recordedAtUtc) <= this.staleAfter ? 'success' : 'warning';
  }

  protected label(trip: ActiveFleetTrip): string {
    const tone = this.tone(trip);

    return tone === 'success' ? 'Live' : tone === 'warning' ? 'Stale' : 'No signal';
  }

  protected select(tripId: string): void {
    this.selected.set(tripId);

    const trip = this.trips().find((candidate) => candidate.tripId === tripId);
    const { latitude, longitude } = trip?.tracking ?? {};

    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      this.focusPoint.set({ lat: latitude, lng: longitude });
    }
  }

  protected openTrip(trip: ActiveFleetTrip): void {
    void this.router.navigate(['/trips', trip.tripId]);
  }
}
