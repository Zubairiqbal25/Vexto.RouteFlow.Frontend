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
import { PushNotifications, VxPushToggle } from '@vexto/push';
import type {
  PassengerAccessStatus,
  PassengerEta,
  PassengerTrip,
  TripLocation,
} from '@vexto/models';
import { TrackingHub } from '@vexto/signalr';
import { PassengerAccessCard } from '../billing/access-card';
import { CrewSheet } from './crew-sheet';
import { SkipSheet } from './skip-sheet';
import {
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { VEXTO_CONFIG, formatDate, formatDayLabel, formatMoney, formatRelative, formatTime, minutesUntil, secondsSince, serviceDate } from '@vexto/utilities';

/**
 * Whether a trip is over as far as the passenger is concerned.
 *
 * Completed and cancelled both are: neither is a bus anybody is still waiting for.
 */
function hasFinished(trip: PassengerTrip): boolean {
  return trip.tripStatus === 'Completed' || trip.tripStatus === 'Cancelled';
}

/**
 * How relevant a trip is to a passenger right now, lowest first.
 *
 * **A bus that is actually moving outranks one scheduled earlier.** Ordering by departure alone
 * looks right and is wrong in the one case that matters: a passenger assigned to a 06:00 that never
 * ran and an 06:30 they are currently sitting on is shown the 06:00, with a dead tracking panel,
 * while the bus they are on is two screens away. Finished trips sort last for the same reason — at
 * lunchtime, this morning's completed journey is not "next".
 */
function relevance(trip: PassengerTrip): number {
  if (trip.tripStatus === 'Started') {
    return 0;
  }

  return hasFinished(trip) ? 2 : 1;
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
    CrewSheet,
    PassengerAccessCard,
    SkipSheet,
    VxAvatar,
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

            <!--
              What is happening right now, in one sentence.

              Each branch is a real state the server told us about, never a guess: a scheduled trip
              counts down to its departure, a started one says the bus is moving, and an estimate is
              only ever quoted when the ETA endpoint returned one. See the ETA block below for why
              an unavailable estimate says so out loud rather than falling silent.
            -->
            <p class="mt-5 text-body font-semibold text-ink" role="status">{{ countdown(trip) }}</p>

            <!--
              Which bus, and who is driving. Tapping opens a sheet with the same two facts and
              nothing more — see CrewSheet for why there is no way to contact the driver from here.
            -->
            <button
              type="button"
              class="mt-4 flex w-full items-center gap-3 rounded-xl border border-line-subtle px-4 py-3 text-start"
              style="background: var(--vexto-surface-muted)"
              (click)="crewOpen.set(true)"
            >
              <vx-avatar size="md" [name]="trip.driverName ?? 'Driver'" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-body font-medium text-ink">
                  {{ trip.driverName ?? 'Driver not assigned yet' }}
                </span>
                <span class="block truncate text-meta text-ink-muted">
                  {{ trip.vehiclePlateNumber ?? 'Vehicle not assigned yet' }}
                </span>
              </span>
              <vx-icon name="chevron-right" [size]="18" class="text-ink-muted" />
            </button>

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
                <!--
                  Deliberately silent. The countdown line above has already said the bus is not
                  reporting; saying it again here, and a third time under the map, filled a phone
                  screen with three sentences of the same news.
                -->
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
            @if (trip.tripStatus !== 'Started') {
              <!--
                Only the case the countdown does not already cover. A bus that has set off and gone
                quiet is reported once, at the top; a bus that has not left yet is a different fact
                and belongs here, where the map would otherwise be.
              -->
              <p class="border-t border-line-subtle px-5 py-4 text-body text-ink-muted">
                Your bus has not started this trip yet. Tracking appears here once it is on the road.
              </p>
            }
          }
        </section>

        <!--
          Shown for every state including "up to date", because a passenger checking whether they
          are paid up should get an answer rather than an absence. Blocked renders prominently and
          leads with Pay now — see PassengerAccessCard.
        -->
        @if (access(); as status) {
          <vexto-access-card
            class="mt-5 block"
            [status]="status"
            [operator]="tenantName()"
          />
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
              (click)="skipOpen.set(true)"
            >
              Skip Tomorrow
            </button>
          </div>
        </div>

        <vexto-crew-sheet
          [open]="crewOpen()"
          [driverName]="trip.driverName"
          [plateNumber]="trip.vehiclePlateNumber"
          [routeName]="trip.routeName"
          [stopName]="trip.stopName"
          (closed)="crewOpen.set(false)"
        />

        <vexto-skip-sheet
          [open]="skipOpen()"
          [trips]="tomorrowsTrips()"
          [serviceDate]="tomorrow()"
          (closed)="skipOpen.set(false)"
          (declared)="onAbsenceDeclared()"
        />
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
  protected readonly crewOpen = signal(false);
  protected readonly skipOpen = signal(false);
  protected readonly nextTrip = signal<PassengerTrip | null>(null);

  /** Every upcoming trip, kept so the absence sheet can offer a choice without a second request. */
  private readonly upcoming = signal<PassengerTrip[]>([]);

  protected readonly tomorrowsTrips = computed(() => {
    const date = this.tomorrow();

    return this.upcoming().filter((trip) => trip.serviceDate === date && !hasFinished(trip));
  });

  /**
   * The soonest unpaid invoice, or null.
   *
   * One, not a list: the home screen answers "where is my bus", and a second question on it earns
   * a single line. The full list is a tab away.
   */
  /**
   * Whether this passenger may travel, and what is outstanding.
   *
   * Null while loading and after a failure: the card is hidden rather than guessed at. Somebody
   * opening this app is looking for their bus first, and a billing error must not take the screen
   * down with it.
   */
  protected readonly access = signal<PassengerAccessStatus | null>(null);

  /** Their operator's name, so a suspended passenger knows who to call. Not Vexto. */
  protected readonly tenantName = computed(() => this.store.tenantName());
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

  /** Tomorrow as an ISO date. The absence API works in service dates, not timestamps. */
  protected tomorrow(): string {
    return serviceDate(1);
  }

  /**
   * The one line that says what is happening now.
   *
   * **Never an invented arrival time.** A countdown to a *scheduled* departure is a plan and is
   * phrased as one; an estimate is only quoted when the server produced one from a fresh position.
   * A bus that has started but stopped reporting says exactly that, because a passenger standing at
   * a stop needs to know the difference between "three minutes away" and "we have lost sight of it".
   */
  protected countdown(trip: PassengerTrip): string {
    if (trip.tripStatus === 'Completed') {
      return 'This trip has finished.';
    }

    if (trip.tripStatus === 'Cancelled') {
      return 'This trip was cancelled by your operator.';
    }

    const estimate = this.eta();

    if (estimate?.status === 'Available' && estimate.minutesAway !== null) {
      const minutes = Number(estimate.minutesAway);

      return minutes <= 1
        ? 'Your bus is arriving now.'
        : `Your bus is about ${minutes} minutes away.`;
    }

    if (trip.tripStatus === 'Started') {
      return this.isLive()
        ? 'Your bus is on the way.'
        : 'Your bus is on the way. Live location is temporarily unavailable.';
    }

    const minutes = minutesUntil(trip.scheduledStartAtUtc);

    if (!Number.isFinite(minutes)) {
      return `Scheduled for ${formatTime(trip.scheduledStartAtUtc)}.`;
    }

    if (minutes <= 0) {
      return 'Due to depart now.';
    }

    if (minutes < 60) {
      return `Starts in ${minutes} min.`;
    }

    return `${formatDayLabel(trip.scheduledStartAtUtc)} at ${formatTime(trip.scheduledStartAtUtc)}.`;
  }

  protected onAbsenceDeclared(): void {
    this.skipOpen.set(false);
    this.load();
  }

  protected greeting(): string {
    const hour = new Date().getHours();
    const period = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return `${period}, ${this.store.user()?.firstName ?? ''}`.trim();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    const today = serviceDate();

    // The authoritative billing state, alongside where their bus is.
    //
    // One request rather than two: this replaces a page of open invoices that the old card sorted
    // client-side to find the soonest due date. The server already knows the outstanding total and
    // — crucially — whether the operator's grace period has run out, which the invoice list alone
    // could never say.
    //
    // A failure leaves the card hidden rather than the screen broken: somebody opening this app is
    // looking for their bus first.
    this.api.accessStatus().subscribe({
      next: (status) => this.access.set(status),
      error: () => this.access.set(null),
    });

    // Twenty-five rather than five. The window starts today and has no end, so five rows cover
    // barely two days for somebody with a morning and an evening service — and the “which trip is
    // next” decision below is then made over a truncated list, which is how a bus that is actually
    // running ends up ranked behind one that is not in the page at all. The rows are thin and the
    // read is bounded either way.
    this.api.myTrips({ fromDate: today, pageSize: 25 }).subscribe({
      next: (result) => {
        // Running first, then not-yet-run, then finished — and departure time only inside each
        // band. See `relevance`.
        const [next] = [...result.items].sort((a, b) => {
          const byRelevance = relevance(a) - relevance(b);

          return byRelevance !== 0
            ? byRelevance
            : a.scheduledStartAtUtc.localeCompare(b.scheduledStartAtUtc);
        });

        this.upcoming.set(result.items);
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

}
