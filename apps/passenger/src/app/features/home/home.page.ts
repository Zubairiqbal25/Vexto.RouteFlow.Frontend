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
import { RouterLink } from '@angular/router';
import { PassengerInvoicesApi, PassengerSelfApi, VextoApiError } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import { VxMap, type VxMapMarker } from '@vexto/maps';
import { PushNotifications, VxPushToggle } from '@vexto/push';
import type {
  PassengerEta,
  PassengerInvoice,
  PassengerTrip,
  TripLocation,
} from '@vexto/models';
import { TrackingHub } from '@vexto/signalr';
import {
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import {
  VEXTO_CONFIG,
  formatDate,
  formatMoney,
  formatRelative,
  formatTime,
  secondsSince,
} from '@vexto/utilities';

/**
 * Whether a trip is over as far as the passenger is concerned.
 *
 * Completed and cancelled both are: neither is a bus anybody is still waiting for.
 */
function hasFinished(trip: PassengerTrip): boolean {
  return trip.tripStatus === 'Completed' || trip.tripStatus === 'Cancelled';
}

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
  imports: [
    RouterLink,
    VxEmptyState,
    VxErrorState,
    VxIcon,
    VxMap,
    VxPushToggle,
    VxSkeleton,
    VxStatusBadge,
  ],
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

            @if (eta(); as estimate) {
              @if (estimate.status === 'Available') {
                <div
                  class="mt-5 flex items-center gap-3 rounded-xl border border-line-subtle
                         bg-surface-muted px-4 py-3"
                >
                  <vx-icon name="live" [size]="20" class="text-primary" />
                  <div class="min-w-0">
                    <p class="text-body font-semibold text-ink">{{ minutesAway() }}</p>
                    <p class="text-meta text-ink-muted">
                      Arriving around {{ time(estimate.estimatedPickupAtUtc!) }}
                      @if (estimate.calculatedAtUtc) {
                        · worked out {{ relative(estimate.calculatedAtUtc) }}
                      }
                    </p>
                  </div>
                </div>
              } @else if (estimate.status === 'TrackingUnavailable') {
                <p class="mt-5 text-meta text-ink-muted">
                  We cannot see your bus at the moment, so there is no arrival estimate. It will
                  appear as soon as it reports again.
                </p>
              } @else if (estimate.status === 'NotAwaited') {
                <p class="mt-5 text-meta text-ink-muted">
                  You are on board, so there is no arrival estimate to show.
                </p>
              } @else {
                <!--
                  'NoStop' and 'RoutingUnavailable'. Both mean the server cannot work out a time,
                  and neither is the passenger's problem to understand — so they get one sentence
                  rather than two explanations of a distinction that changes nothing for them.
                  Saying nothing, which is what this screen used to do, reads as a broken page.
                -->
                <p class="mt-5 text-meta text-ink-muted">
                  We cannot work out an arrival time for this trip. Your scheduled pickup is above.
                </p>
              }
            }
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
            <!--
              Two different situations, and telling a passenger the wrong one is worse than saying
              nothing. No position because the trip has not begun is a matter of waiting; no
              position on a trip already under way means the bus is out there and its device is not
              reporting — which is what the passenger standing at the stop needs to know.
            -->
            <p class="border-t border-line-subtle px-5 py-4 text-body text-ink-muted">
              @if (trip.tripStatus === 'Started') {
                Your bus is on the road, but it is not reporting its position at the moment.
                Tracking appears here as soon as it does.
              } @else {
                Your bus has not started this trip yet. Tracking appears here once it is on the
                road.
              }
            </p>
          }
        </section>

        @if (amountDue(); as due) {
          <!--
            Only when something is actually owed. A card reading "AED 0.00 due" on every screen is
            how people stop reading the screen.
          -->
          <section class="vx-card mt-5 p-5">
            <p class="vx-section-label">Payment due</p>
            <p class="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {{ money(due.total, due.currency) }}
            </p>
            <p class="mt-1 text-meta text-ink-muted">Due {{ date(due.dueDate) }}</p>

            <a class="vx-btn vx-btn-primary vx-btn-touch mt-4 w-full" [routerLink]="['/payments', due.id]">
              Pay now
            </a>
          </section>
        }

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

          <!--
            Offered after the trip, not before it: somebody who has just seen their bus on a map is
            in a position to decide whether they want to be told about it. The control renders
            nothing at all when push is unconfigured or unsupported.
          -->
          <vx-push-toggle />

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
  private readonly invoicesApi = inject(PassengerInvoicesApi);
  private readonly hub = inject(TrackingHub);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly staleAfter = inject(VEXTO_CONFIG).staleLocationAfterSeconds;

  protected readonly date = formatDate;
  protected readonly time = formatTime;
  protected readonly money = formatMoney;
  protected readonly relative = formatRelative;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly skipping = signal(false);
  protected readonly nextTrip = signal<PassengerTrip | null>(null);

  /**
   * The soonest unpaid invoice, or null.
   *
   * One, not a list: the home screen answers "where is my bus", and a second question on it earns
   * a single line. The full list is a tab away.
   */
  protected readonly amountDue = signal<PassengerInvoice | null>(null);
  protected readonly tracking = signal<TripLocation | null>(null);
  protected readonly eta = signal<PassengerEta | null>(null);

  /**
   * Wording rather than a bare number. "1 minute away" and "Arriving now" read very differently to
   * somebody deciding whether to put their shoes on.
   */
  protected readonly minutesAway = computed(() => {
    const minutes = this.eta()?.minutesAway;

    if (minutes === null || minutes === undefined) {
      return '';
    }

    if (minutes <= 1) {
      return 'Arriving now';
    }

    return `${minutes} minutes away`;
  });

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

    // Re-registers a device that already has permission, because Firebase rotates tokens on its
    // own schedule. It asks the browser for nothing and returns immediately unless permission was
    // granted previously — no prompt is ever fired on load.
    void inject(PushNotifications).refresh();

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

    this.destroyRef.onDestroy(() => void this.hub.stop());
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

    // What they owe, alongside where their bus is. A failure here leaves the card hidden rather
    // than the screen broken: somebody opening this app is looking for their bus first.
    this.invoicesApi.invoices({ status: 'Open', pageSize: 5 }).subscribe({
      next: (result) => {
        const [soonest] = [...result.items].sort((first, second) =>
          first.dueDate.localeCompare(second.dueDate),
        );

        this.amountDue.set(soonest ?? null);
      },
      error: () => this.amountDue.set(null),
    });

    this.api.myTrips({ fromDate: today, pageSize: 5 }).subscribe({
      next: (result) => {
        // Trips that have not finished first, then by departure. Sorting on departure alone
        // means a passenger who checks the app at lunchtime is shown this morning's completed
        // journey as their "next trip" — with a dead tracking panel — instead of the bus home.
        const [next] = [...result.items].sort((a, b) => {
          const finished = Number(hasFinished(a)) - Number(hasFinished(b));

          return finished !== 0
            ? finished
            : a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc);
        });

        this.nextTrip.set(next ?? null);
        this.loading.set(false);

        if (next) {
          this.loadPosition(next.tripId);
          this.loadEta(next.tripId);
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

  /**
   * The arrival estimate, refreshed on a slow timer while this page is open.
   *
   * Deliberately slower than the position feed, which arrives over SignalR every few seconds. The
   * backend throttles routing-provider calls to roughly one a minute per stop anyway, so polling
   * faster would return the same figure and cost a request each time. Thirty seconds keeps the
   * displayed number within a minute of the truth without ever getting ahead of the server.
   */
  private loadEta(tripId: string): void {
    const refresh = () =>
      this.api.tripEta(tripId).subscribe({
        next: (estimate) => this.eta.set(estimate),

        // No estimate is a normal state, not an error to interrupt anyone with.
        error: () => this.eta.set(null),
      });

    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, 30_000);

    this.destroyRef.onDestroy(() => clearInterval(timer));
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
