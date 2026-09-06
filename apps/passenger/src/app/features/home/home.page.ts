import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PassengerSelfApi, VextoApiError } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import { VxMap, type VxMapMarker } from '@vexto/maps';
import type { PassengerTrip, TripLocation } from '@vexto/models';
import { TrackingHub } from '@vexto/signalr';
import {
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { VEXTO_CONFIG, formatDate, formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/**
 * A passenger's home screen: one question — where is my bus — answered as directly as possible.
 *
 * Nothing here looks like the operator portal. There is no table, no status vocabulary, and no
 * coordinate on screen: a passenger is told the bus is *live*, or that its position is temporarily
 * unavailable, which is the only part of that data they can act on.
 *
 * Tracking is opened only for the passenger's own next trip, and the server decides whether that
 * subscription is allowed — the client cannot ask to watch someone else's bus.
 */
@Component({
  selector: 'vexto-passenger-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxEmptyState, VxErrorState, VxIcon, VxMap, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <p class="text-body text-ink-muted">{{ greeting() }}</p>

      @if (error(); as message) {
        <vx-error-state title="We could not load your trip" [message]="message" (retry)="load()" />
      } @else if (loading()) {
        <vx-skeleton height="10rem" />
      } @else if (nextTrip(); as trip) {
        <h1 class="mt-1 text-lg font-semibold tracking-tight text-ink">Your next trip</h1>

        <section class="vx-card mt-4 overflow-hidden">
          <div class="p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-lg font-semibold text-ink">{{ trip.routeName }}</p>
                <p class="mt-0.5 text-meta text-ink-muted">{{ date(trip.serviceDate) }}</p>
              </div>
              <vx-status-badge [status]="trip.tripStatus" />
            </div>

            <dl class="mt-5 grid grid-cols-2 gap-5">
              <div>
                <dt class="vx-section-label">Pickup</dt>
                <dd class="mt-1 text-body font-semibold text-ink">
                  {{ trip.stopName ?? 'Your usual stop' }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Scheduled</dt>
                <dd class="mt-1 text-2xl font-semibold tracking-tight text-ink">
                  {{ time(trip.scheduledStartAtUtc) }}
                </dd>
              </div>
            </dl>
          </div>

          @if (tracking(); as position) {
            <div class="h-64 border-t border-line-subtle">
              <vx-map
                class="block size-full"
                [markers]="markers()"
                [center]="center()"
                [zoom]="14"
              />
            </div>
            <div class="flex items-center gap-2.5 border-t border-line-subtle px-5 py-4">
              @if (isLive()) {
                <span
                  class="flex size-2.5 flex-none rounded-full"
                  style="background: var(--vexto-success)"
                  aria-hidden="true"
                ></span>
                <p class="text-body font-medium text-ink">
                  Live · updated {{ relative(position.recordedAtUtc) }}
                </p>
              } @else {
                <vx-icon name="signal-off" [size]="18" class="text-ink-muted" />
                <p class="text-body text-ink-muted">Location temporarily unavailable</p>
              }
            </div>
          } @else {
            <p class="border-t border-line-subtle px-5 py-4 text-body text-ink-muted">
              Your bus has not started this trip yet. Tracking appears here once it is on the road.
            </p>
          }
        </section>

        <div class="mt-5 flex flex-col gap-3">
          <button
            type="button"
            class="vx-btn vx-btn-primary vx-btn-touch w-full"
            [disabled]="!tracking()"
            (click)="watch(trip)"
          >
            <vx-icon name="live" [size]="18" />
            Track Bus
          </button>

          <div class="vx-card p-5">
            <p class="text-body font-medium text-ink">Not travelling tomorrow?</p>
            <p class="mt-1 text-meta text-ink-muted">
              Tell your operator so your seat is not held.
            </p>
            <button
              type="button"
              class="vx-btn vx-btn-secondary vx-btn-touch mt-4 w-full"
              [disabled]="skipping()"
              (click)="skipTomorrow()"
            >
              {{ skipping() ? 'Saving…' : 'Skip Tomorrow' }}
            </button>
          </div>
        </div>
      } @else {
        <vx-empty-state
          icon="trips"
          title="No upcoming trips"
          description="When your operator schedules your transport, your next bus will appear here."
        />
      }
    </div>
  `,
})
export class PassengerHomePage {
  private readonly api = inject(PassengerSelfApi);
  private readonly hub = inject(TrackingHub);
  private readonly store = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly staleAfter = inject(VEXTO_CONFIG).staleLocationAfterSeconds;

  protected readonly date = formatDate;
  protected readonly time = formatTime;
  protected readonly relative = formatRelative;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly skipping = signal(false);
  protected readonly nextTrip = signal<PassengerTrip | null>(null);
  protected readonly tracking = signal<TripLocation | null>(null);

  protected readonly isLive = computed(() => {
    const position = this.tracking();

    return (
      !!position?.recordedAtUtc && secondsSince(position.recordedAtUtc) <= this.staleAfter
    );
  });

  protected readonly center = computed(() => {
    const position = this.tracking();

    return position?.latitude !== null && position?.latitude !== undefined && position.longitude
      ? { lat: position.latitude, lng: position.longitude }
      : null;
  });

  protected readonly markers = computed<VxMapMarker[]>(() => {
    const point = this.center();

    return point
      ? [
          {
            id: 'bus',
            lat: point.lat,
            lng: point.lng,
            label: 'Your bus',
            tone: this.isLive() ? 'success' : 'warning',
            heading: this.tracking()?.headingDegrees ?? null,
            selected: true,
          },
        ]
      : [];
  });

  constructor() {
    this.load();

    this.hub.updates.pipe(takeUntilDestroyed()).subscribe((update) => {
      if (update.tripId !== this.nextTrip()?.tripId) {
        return;
      }

      this.tracking.update((current) =>
        current
          ? {
              ...current,
              latitude: update.latitude,
              longitude: update.longitude,
              headingDegrees: update.headingDegrees,
              speedKph: update.speedKph,
              recordedAtUtc: update.recordedAtUtc,
              trackingStatus: update.trackingStatus,
            }
          : current,
      );
    });

    // Subscribe as soon as a trip is known, so the map is live before the passenger taps anything.
    effect(() => {
      const trip = this.nextTrip();

      if (trip && this.tracking()) {
        void this.hub.watchTrip(trip.tripId);
      }
    });

    inject(DestroyRef).onDestroy(() => void this.hub.stop());
  }

  protected greeting(): string {
    const hour = new Date().getHours();
    const period = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return `${period}, ${this.store.user()?.firstName ?? ''}`.trim();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    const today = new Date().toISOString().slice(0, 10);

    this.api.myTrips({ fromDate: today, pageSize: 5 }).subscribe({
      next: (result) => {
        const [next] = [...result.items].sort((a, b) =>
          a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc),
        );

        this.nextTrip.set(next ?? null);
        this.loading.set(false);

        if (next) {
          this.loadPosition(next.tripId);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load your trip.',
        );
      },
    });
  }

  /** One position fetch establishes the marker; SignalR moves it from then on. */
  private loadPosition(tripId: string): void {
    this.api.tripLocation(tripId).subscribe({
      next: (position) =>
        this.tracking.set(position.latitude === null ? null : position),
      // A trip that has not started has no position, and that is not an error worth showing.
      error: () => this.tracking.set(null),
    });
  }

  protected watch(trip: PassengerTrip): void {
    void this.hub.watchTrip(trip.tripId).then((granted) => {
      if (granted) {
        this.toast.success('Following your bus.');
      } else {
        this.toast.error('Live tracking is not available for this trip yet.');
      }
    });
  }

  protected skipTomorrow(): void {
    this.skipping.set(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    this.api
      .declareAbsence({
        serviceDate: tomorrow.toISOString().slice(0, 10),
        routeId: null,
        reason: null,
      })
      .subscribe({
        next: (result) => {
          this.skipping.set(false);
          this.toast.success(
            result.tripsAffected > 0
              ? `Noted. ${result.tripsAffected} trip${result.tripsAffected === 1 ? '' : 's'} updated.`
              : 'Noted. You are marked as not travelling tomorrow.',
          );
        },
        error: (error: unknown) => {
          this.skipping.set(false);
          this.toast.error(
            error instanceof VextoApiError ? error.message : 'We could not save that.',
          );
        },
      });
  }
}
