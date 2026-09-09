import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DriverApi, VextoApiError } from '@vexto/api-client';
import type {
  DriverManifestPassenger,
  DriverNextStopDetail,
  DriverTripDetail,
  TripPassenger,
} from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxErrorState,
  VxIcon,
  VxProgressRing,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { type VxMapMarker, VxMap } from '@vexto/maps';
import { formatTime } from '@vexto/utilities';
import { isNotToBeCarried, manifestGroups, nextPassenger } from './manifest-order';
import { LocationPublisher } from './location-publisher.service';

/**
 * The screen a driver actually works from.
 *
 * Everything is sized for a tablet on a dashboard mount: one enormous primary action, a passenger
 * list with two large buttons per row, and no navigation to get lost in. Attendance updates the row
 * in place rather than reloading the list, so the driver never loses their position in it.
 *
 * Location publishing starts when the trip starts and stops when it completes or the screen is left.
 */
@Component({
  selector: 'vexto-driver-trip-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VxAvatar,
    VxErrorState,
    VxIcon,
    VxMap,
    VxProgressRing,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    <div class="p-4">
      <a routerLink="/trips" class="mb-3 inline-flex items-center gap-1.5 text-body text-ink-muted">
        <vx-icon name="arrow-left" [size]="17" />
        All trips
      </a>

      @if (detail()?.trip?.status === 'Started' && passengers().length > 0) {
        <!--
          How much of the route is done, kept on screen while the manifest scrolls.

          Sticky rather than pinned to the bottom: a bottom bar on a tablet in a dashboard mount
          covers the two buttons the driver is reaching for. At the top it answers “am I nearly
          finished” without ever being in the way of recording a boarding.
        -->
        <div
          class="sticky top-0 z-20 -mx-4 mb-3 border-b border-line-subtle px-4 py-2.5"
          style="background: var(--vexto-surface)"
          role="status"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p class="text-body font-semibold tabular-nums text-ink">
              {{ pickedUp() }} / {{ passengers().length }} picked up
            </p>
            <p class="text-meta text-ink-muted">{{ remaining() }} remaining</p>
          </div>
          <div
            class="mt-2 h-2 w-full overflow-hidden rounded-full"
            style="background: var(--vexto-surface-sunken)"
            role="img"
            [attr.aria-label]="pickedUp() + ' of ' + passengers().length + ' picked up'"
          >
            <span
              class="block h-full transition-[width] duration-500 ease-out"
              style="background: var(--vexto-success)"
              [style.width.%]="progressPercent()"
            ></span>
          </div>
        </div>
      }

      @if (error(); as message) {
        <vx-error-state title="We could not load this trip" [message]="message" (retry)="load()" />
      } @else if (loading()) {
        <vx-skeleton height="12rem" />
      } @else if (detail(); as loaded) {
        <div class="grid gap-4 lg:grid-cols-[1fr_26rem] lg:items-start">
        <div class="flex flex-col gap-4">
        @if (loaded.trip.status === 'Started' && mapMarkers().length > 0) {
          <!--
            Where the bus is and where it is going next.

            Two pins and nothing else: the driver already has turn-by-turn navigation on the same
            device and trusts it, so this is orientation, not guidance. It is drawn from the fix the
            device just gave us rather than from the server — asking Vexto where this driver is
            would be slower and less accurate than asking the phone in their hand.
          -->
          <section class="h-56 w-full overflow-hidden rounded-2xl sm:h-72 lg:h-80">
            <vx-map [markers]="mapMarkers()" [center]="mapCentre()" [zoom]="15" />
          </section>
        }

        <section class="vx-card p-5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-lg font-semibold tracking-tight text-ink">
                {{ loaded.trip.routeName }}
              </h1>
              <p class="mt-0.5 text-meta text-ink-muted">
                {{ loaded.trip.routeCode }} · {{ loaded.trip.vehiclePlateNumber ?? 'No vehicle' }}
              </p>
            </div>
            <vx-status-badge [status]="loaded.trip.status" />
          </div>

          <div class="mt-4 flex items-center justify-between gap-4">
            <dl class="grid flex-1 grid-cols-2 gap-4">
              <div>
                <dt class="vx-section-label">Departs</dt>
                <dd class="mt-0.5 text-xl font-semibold text-ink">
                  {{ time(loaded.trip.scheduledStartAtUtc) }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Picked up</dt>
                <dd class="mt-0.5 text-xl font-semibold tabular-nums text-ink">
                  {{ pickedUp() }} / {{ passengers().length }}
                </dd>
              </div>
            </dl>

            @if (loaded.trip.status === 'Started' && passengers().length > 0) {
              <vx-progress-ring
                label="Picked up"
                tone="success"
                [size]="84"
                [value]="pickedUp()"
                [total]="passengers().length"
              />
            }
          </div>

          @switch (loaded.trip.status) {
            @case ('Started') {
              <div
                class="mt-5 flex items-center gap-2.5 rounded-xl px-4 py-3"
                [style.background]="
                  publisher.isActive() ? 'var(--vexto-success-soft)' : 'var(--vexto-warning-soft)'
                "
                [style.color]="
                  publisher.isActive() ? 'var(--vexto-success-text)' : 'var(--vexto-warning-text)'
                "
                role="status"
              >
                <vx-icon [name]="publisher.isActive() ? 'signal' : 'signal-off'" [size]="18" />
                <span class="text-body font-medium">{{ publisher.message() }}</span>
              </div>

              @if (publisher.state() === 'denied') {
                <p class="mt-2 text-meta text-ink-muted">
                  Allow location for this site in your browser settings so your dispatcher can see
                  the bus. Boarding still works without it.
                </p>
              }

              @if (nextStop(); as stop) {
                <div class="mt-5 rounded-xl border border-line-subtle bg-surface-muted p-4">
                  <p class="vx-section-label">Next stop</p>
                  <p class="mt-1 text-body font-semibold text-ink">
                    @if (stop.sequence !== null) {
                      {{ stop.sequence }}.
                    }
                    {{ stop.name ?? 'Unnamed stop' }}
                  </p>
                  <p class="mt-0.5 text-meta text-ink-muted">
                    {{ stop.expectedPassengers.length }}
                    {{ stop.expectedPassengers.length === 1 ? 'passenger' : 'passengers' }} waiting
                  </p>

                  @if (navigationUrl(); as url) {
                    <!--
                      An external link into whichever maps app the device has, not an embedded
                      navigator. Building one would mean rebuilding a routing engine, voice
                      guidance and offline tiles that the driver already has and already trusts.
                    -->
                    <a
                      class="vx-btn vx-btn-secondary vx-btn-touch mt-3 w-full"
                      [href]="url"
                      target="_blank"
                      rel="noopener"
                    >
                      <vx-icon name="live" [size]="18" />
                      Navigate to stop
                    </a>
                  }
                </div>
              } @else if (nextStopLoaded()) {
                <p class="mt-5 rounded-xl border border-line-subtle px-4 py-3 text-body text-ink-muted">
                  Every pickup on this route has been dealt with. You can complete the trip.
                </p>
              }

              <button
                type="button"
                class="vx-btn vx-btn-primary vx-btn-touch mt-4 w-full"
                [disabled]="busy()"
                (click)="complete()"
              >
                Complete trip
              </button>
            }
            @case ('Completed') {
              <p class="mt-5 text-body text-ink-muted">
                This trip is finished. Attendance can no longer be changed.
              </p>
            }
            @case ('Cancelled') {
              <p class="mt-5 text-body text-ink-muted">This trip was cancelled by your operator.</p>
            }
            @default {
              <button
                type="button"
                class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full text-lg"
                [disabled]="busy()"
                (click)="start()"
              >
                {{ busy() ? 'Starting…' : 'START TRIP' }}
              </button>
            }
          }
        </section>

        @if (loaded.trip.status === 'Started' && nextPassenger(); as next) {
          <!--
            The single most important thing on screen while a bus is moving: who is next, where they
            are, and the two buttons that record what happened. Large enough to hit from the driver's
            seat without looking twice.
          -->
          <section
            class="vx-card overflow-hidden"
            [style.border-color]="isBlocked(next) ? 'var(--vexto-danger)' : 'var(--vexto-primary)'"
            aria-labelledby="next-pickup-heading"
          >
            <p
              id="next-pickup-heading"
              class="px-5 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-white"
              [style.background]="isBlocked(next) ? 'var(--vexto-danger)' : 'var(--vexto-primary)'"
            >
              Next pickup
            </p>

            <div class="flex items-center gap-4 p-5">
              <vx-avatar
                size="xl"
                [name]="next.name"
                [hasPhoto]="next.hasPhoto"
                [photoPath]="passengerPhotoPath(next)"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xl font-semibold text-ink">{{ next.name }}</p>
                <p class="mt-1 truncate text-body text-ink-secondary">
                  {{ next.stop ?? 'No stop recorded' }}
                </p>
                <!--
                  Operational access only. Whether this person may travel is a yes or a no; what
                  they owe, to whom and since when is between them and the operator, and putting an
                  amount on a screen a driver holds up at the kerb would be broadcasting it.
                -->
                @if (isBlocked(next)) {
                  <p
                    class="mt-2 inline-flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide"
                    style="color: var(--vexto-danger-text)"
                  >
                    <vx-icon name="ban" [size]="15" />
                    Payment blocked
                  </p>
                } @else {
                  <p
                    class="mt-2 inline-flex items-center gap-1.5 text-meta font-medium"
                    style="color: var(--vexto-success-text)"
                  >
                    <vx-icon name="check-circle" [size]="15" />
                    Access allowed
                  </p>
                }
              </div>
            </div>

            @if (navigationUrl(); as url) {
              <div class="px-5">
                <a
                  class="vx-btn vx-btn-secondary vx-btn-touch w-full"
                  [href]="url"
                  target="_blank"
                  rel="noopener"
                >
                  <vx-icon name="navigate" [size]="18" />
                  Navigate
                </a>
              </div>
            }

            @if (canRecord()) {
              @if (isBlocked(next)) {
                <div class="p-5">
                  <p
                    class="rounded-xl px-4 py-3 text-body font-medium"
                    style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
                    role="status"
                  >
                    This passenger cannot travel today. Do not wait — carry on to the next stop.
                  </p>
                </div>
              } @else {
                <div class="grid grid-cols-2 gap-3 p-5">
                  <button
                    type="button"
                    class="vx-btn vx-btn-primary vx-btn-touch"
                    (click)="board(next)"
                  >
                    Boarded
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-secondary vx-btn-touch"
                    (click)="noShow(next)"
                  >
                    No Show
                  </button>
                </div>
              }
            }
          </section>
        }
        </div>

        <div class="min-w-0">
        <h2 class="mb-3 text-base font-semibold text-ink">Passengers</h2>

        @if (passengers().length === 0) {
          <p class="vx-card p-5 text-body text-ink-muted">
            No passengers are booked on this trip.
          </p>
        } @else {
          @for (group of manifestGroups(); track group.key) {
          <p class="vx-section-label mb-2 mt-4 first:mt-0">
            {{ group.label }} · {{ group.passengers.length }}
          </p>
          <ul class="flex flex-col gap-3">
            @for (passenger of group.passengers; track passenger.id; let index = $index) {
              <li class="vx-card p-4">
                <div class="flex items-start gap-3">
                  <!-- Sequence and face together: the driver matches a person at the kerb to a row,
                       and the number alone does not help them do that. -->
                  <span class="relative flex-none">
                    <vx-avatar
                      size="md"
                      [name]="passenger.name"
                      [hasPhoto]="passenger.hasPhoto"
                      [photoPath]="passengerPhotoPath(passenger)"
                    />
                    <span
                      class="absolute -bottom-1 -start-1 flex size-5 items-center justify-center
                             rounded-full text-[0.625rem] font-semibold"
                      style="background: var(--vexto-surface-raised); color: var(--vexto-text-secondary);
                             box-shadow: 0 0 0 1px var(--vexto-border)"
                      aria-hidden="true"
                    >
                      {{ stopNumber(passenger) }}
                    </span>
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-base font-semibold text-ink">{{ passenger.name }}</p>
                    <p class="mt-0.5 text-meta text-ink-muted">{{ passenger.stop ?? 'No stop' }}</p>
                  </div>
                  <vx-status-badge [status]="passenger.status" />
                </div>

                @if (isBlocked(passenger)) {
                  <!--
                    Operational only. The driver is told not to wait; they are deliberately not
                    told what is owed, by whom, or since when.
                  -->
                  <p
                    class="mt-3 rounded-md bg-danger-soft px-3 py-2 text-meta font-semibold uppercase tracking-wide text-danger-text"
                    role="status"
                  >
                    Payment blocked — do not pick up
                  </p>
                }

                @if (canRecord() && passenger.status === 'Expected' && !isBlocked(passenger)) {
                  <div class="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      class="vx-btn vx-btn-primary vx-btn-touch"
                      (click)="board(passenger)"
                    >
                      Boarded
                    </button>
                    <button
                      type="button"
                      class="vx-btn vx-btn-secondary vx-btn-touch"
                      (click)="noShow(passenger)"
                    >
                      No Show
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
          }
        }
        </div>
        </div>
      }
    </div>
  `,
})
export class DriverTripPage {
  private readonly api = inject(DriverApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  protected readonly publisher = inject(LocationPublisher);

  readonly tripId = input.required<string>();

  protected readonly time = formatTime;

  protected readonly detail = signal<DriverTripDetail | null>(null);

  /**
   * How far through the pickups the driver is.
   *
   * Counted from the manifest already on screen rather than fetched: the numbers must agree with
   * the rows beneath them, and a second source would eventually disagree after a boarding.
   */
  protected readonly pickedUp = computed(
    () =>
      this.passengers().filter(
        (passenger) => passenger.status === 'Boarded' || passenger.status === 'DroppedOff',
      ).length,
  );

  /**
   * The manifest, banded into what is still to do and what is settled, and the person next.
   *
   * The rules are in `manifest-order.ts` as pure functions with their own tests — the ordering is
   * the part of this screen most worth getting right, and the part least worth verifying by
   * looking at it.
   */
  protected readonly manifestGroups = computed(() => manifestGroups(this.passengers()));

  protected readonly nextPassenger = computed(() => nextPassenger(this.passengers()));

  /**
   * Where this passenger's photo comes from.
   *
   * Routed through the trip, not through `/api/v1/passengers/{id}/photo`. The API authorizes it as
   * "is this the signed-in driver's own trip", so a driver can only ever see the faces of people on
   * a bus they are actually driving — a flat route open to the Driver role would let any driver page
   * through every passenger the operator has.
   */
  protected passengerPhotoPath(passenger: DriverManifestPassenger): string {
    return `/api/v1/driver/me/trips/${this.tripId()}/passengers/${passenger.passengerId}/photo`;
  }

  /**
   * The bus and its next stop, as pins.
   *
   * Only ever these two. Drawing every remaining stop would turn the map into a plan of the route,
   * which is the dispatcher's question. The driver's is only "where am I, and where next".
   */
  protected readonly mapMarkers = computed<VxMapMarker[]>(() => {
    const markers: VxMapMarker[] = [];
    const stop = this.nextStop();
    const me = this.publisher.position();

    if (stop && stop.latitude !== null && stop.longitude !== null) {
      markers.push({
        id: 'next-stop',
        lat: Number(stop.latitude),
        lng: Number(stop.longitude),
        label: stop.name ?? 'Next stop',
        tone: 'primary',
      });
    }

    if (me) {
      markers.push({
        id: 'bus',
        lat: me.lat,
        lng: me.lng,
        label: 'Your bus',
        tone: 'success',
        heading: me.heading,
      });
    }

    return markers;
  });

  /** Centred on the bus while it is reporting, and on the destination before the first fix. */
  protected readonly mapCentre = computed(() => {
    const me = this.publisher.position();

    if (me) {
      return { lat: me.lat, lng: me.lng };
    }

    const stop = this.mapMarkers()[0];

    return stop ? { lat: stop.lat, lng: stop.lng } : null;
  });

  /** People still to deal with. The number a driver counts down, not the one they count up. */
  protected readonly remaining = computed(() => this.passengers().length - this.pickedUp());

  protected readonly progressPercent = computed(() => {
    const total = this.passengers().length;

    return total === 0 ? 0 : (this.pickedUp() / total) * 100;
  });

  protected readonly nextStop = signal<DriverNextStopDetail | null>(null);
  protected readonly nextStopLoaded = signal(false);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * A universal maps link for the next stop.
   *
   * `google.com/maps/dir/?api=1` is handled by the Google Maps app on Android and iOS, and falls
   * back to the browser everywhere else. Apple Maps also intercepts it on iOS when it is the
   * default. One URL rather than sniffing the platform: the guess is what breaks, not the link.
   */
  protected readonly navigationUrl = computed(() => {
    const stop = this.nextStop();

    if (!stop || stop.latitude === null || stop.longitude === null) {
      return null;
    }

    const destination = encodeURIComponent(`${stop.latitude},${stop.longitude}`);

    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  });

  protected readonly passengers = computed(() => this.detail()?.passengers ?? []);

  protected readonly canRecord = computed(() => this.detail()?.trip.status === 'Started');

  constructor() {
    effect(() => {
      this.tripId();
      this.load();
    });

    // Tracking follows the trip's state, wherever that state came from — starting it here rather
    // than only in start() means a driver who reloads mid-trip resumes publishing.
    effect(() => {
      const trip = this.detail()?.trip;

      if (trip?.status === 'Started') {
        this.publisher.start(trip.tripId);
      } else {
        this.publisher.stop();
      }
    });

    inject(DestroyRef).onDestroy(() => this.publisher.stop());
  }

  /**
   * The passenger's own place in the route, not their place in this list.
   *
   * Once the manifest is grouped, a list index restarts inside each group — so the third person
   * still waiting would be badged "03" while the driver is at stop nine. The trip carries the real
   * sequence; a passenger with none shows a dash rather than a number that means nothing.
   */
  protected stopNumber(passenger: DriverManifestPassenger): string {
    return passenger.sequence === null || passenger.sequence === undefined
      ? '–'
      : String(passenger.sequence).padStart(2, '0');
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.myTrip(this.tripId()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);

        // Only a running trip has a next stop worth showing. Before it starts the answer is the
        // first stop, which the driver can already see on the manifest.
        if (detail.trip.status === 'Started') {
          this.loadNextStop();
        } else {
          this.nextStop.set(null);
          this.nextStopLoaded.set(false);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load this trip.',
        );
      },
    });
  }

  /**
   * Reloaded after every boarding, because boarding the last person at a stop is exactly what
   * moves the driver on to the next one.
   */
  /** Only meaningful while the trip is running; ignored otherwise. */
  private refreshNextStop(): void {
    if (this.detail()?.trip.status === 'Started') {
      this.loadNextStop();
    }
  }

  private loadNextStop(): void {
    this.api.nextStop(this.tripId()).subscribe({
      next: (result) => {
        this.nextStop.set(result.stop);
        this.nextStopLoaded.set(true);
      },
      error: () => {
        this.nextStop.set(null);
        this.nextStopLoaded.set(false);
      },
    });
  }

  protected start(): void {
    this.busy.set(true);

    this.api.start(this.tripId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Trip started.');
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not start this trip.',
        );
      },
    });
  }

  protected async complete(): Promise<void> {
    const outstanding = this.passengers().filter(
      (passenger) => passenger.status === 'Expected',
    ).length;

    const confirmed = await this.confirm.ask({
      title: 'Complete this trip?',
      message:
        outstanding > 0
          ? `${outstanding} ${outstanding === 1 ? 'passenger has' : 'passengers have'} not been `
            + 'marked as boarded or no-show. Completing the trip closes attendance.'
          : 'Attendance will be closed and location sharing will stop.',
      confirmLabel: 'Complete trip',
      cancelLabel: 'Not yet',
    });

    if (!confirmed) {
      return;
    }

    this.busy.set(true);

    this.api.complete(this.tripId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.publisher.stop();
        this.toast.success('Trip completed.');
        void this.router.navigate(['/trips']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not complete this trip.',
        );
      },
    });
  }

  protected board(passenger: DriverManifestPassenger): void {
    this.api.board(this.tripId(), passenger.id).subscribe({
      next: (updated) => this.replace(updated),
      error: () => this.toast.error('We could not record that boarding.'),
    });
  }

  protected noShow(passenger: DriverManifestPassenger): void {
    this.api.markNoShow(this.tripId(), passenger.id).subscribe({
      next: (updated) => this.replace(updated),
      error: () => this.toast.error('We could not record that no-show.'),
    });
  }

  /**
   * Swaps one row in place; reloading the whole trip would scroll the driver back to the top.
   *
   * The next stop is refreshed alongside it, because dealing with the last person at a stop is
   * exactly what moves the driver on to the next one.
   *
   * The attendance fields are merged over the existing row rather than replacing it. The board and
   * no-show endpoints answer with the trip's own view of a passenger, which carries no access
   * state and no photo flag — those are added to the manifest by the API host, and overwriting the
   * row wholesale would blank them until the next full load.
   */
  private replace(updated: TripPassenger): void {
    this.refreshNextStop();

    this.detail.update((current) =>
      current
        ? {
            ...current,
            passengers: current.passengers.map((passenger) =>
              passenger.id === updated.id
                ? {
                    ...passenger,
                    status: updated.status,
                    boardedAtUtc: updated.boardedAtUtc,
                    noShowAtUtc: updated.noShowAtUtc,
                    droppedOffAtUtc: updated.droppedOffAtUtc,
                  }
                : passenger,
            ),
          }
        : current,
    );
  }

  /**
   * Whether the operator's billing rules currently stop this passenger travelling.
   *
   * The manifest carries an access state and nothing else about money — no amount, no due date, no
   * invoice. A driver needs to know not to wait at the kerb; a passenger's finances are not part of
   * driving them.
   */
  protected isBlocked(passenger: DriverManifestPassenger): boolean {
    return isNotToBeCarried(passenger);
  }
}
