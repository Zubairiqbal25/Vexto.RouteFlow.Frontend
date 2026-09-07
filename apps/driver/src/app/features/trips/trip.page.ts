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
import type { DriverNextStopDetail, DriverTripDetail, TripPassenger } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxErrorState,
  VxIcon,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { formatTime } from '@vexto/utilities';
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
  imports: [RouterLink, VxErrorState, VxIcon, VxSkeleton, VxStatusBadge],
  template: `
    <div class="p-4">
      <a routerLink="/trips" class="mb-3 inline-flex items-center gap-1.5 text-body text-ink-muted">
        <vx-icon name="arrow-left" [size]="17" />
        All trips
      </a>

      @if (error(); as message) {
        <vx-error-state title="We could not load this trip" [message]="message" (retry)="load()" />
      } @else if (loading()) {
        <vx-skeleton height="12rem" />
      } @else if (detail(); as loaded) {
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

          <dl class="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt class="vx-section-label">Departs</dt>
              <dd class="mt-0.5 text-xl font-semibold text-ink">
                {{ time(loaded.trip.scheduledStartAtUtc) }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Passengers</dt>
              <dd class="mt-0.5 text-xl font-semibold text-ink">{{ passengers().length }}</dd>
            </div>
          </dl>

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

        <h2 class="mb-3 mt-6 text-base font-semibold text-ink">Passengers</h2>

        @if (passengers().length === 0) {
          <p class="vx-card p-5 text-body text-ink-muted">
            No passengers are booked on this trip.
          </p>
        } @else {
          <ul class="flex flex-col gap-3">
            @for (passenger of passengers(); track passenger.id; let index = $index) {
              <li class="vx-card p-4">
                <div class="flex items-start gap-3">
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-muted text-meta font-semibold text-ink-secondary"
                  >
                    {{ number(index) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-base font-semibold text-ink">{{ passenger.name }}</p>
                    <p class="mt-0.5 text-meta text-ink-muted">{{ passenger.stop ?? 'No stop' }}</p>
                  </div>
                  <vx-status-badge [status]="passenger.status" />
                </div>

                @if (canRecord() && passenger.status === 'Expected') {
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

  protected number(index: number): string {
    return String(index + 1).padStart(2, '0');
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

  protected board(passenger: TripPassenger): void {
    this.api.board(this.tripId(), passenger.id).subscribe({
      next: (updated) => this.replace(updated),
      error: () => this.toast.error('We could not record that boarding.'),
    });
  }

  protected noShow(passenger: TripPassenger): void {
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
   */
  private replace(updated: TripPassenger): void {
    this.refreshNextStop();

    this.detail.update((current) =>
      current
        ? {
            ...current,
            passengers: current.passengers.map((passenger) =>
              passenger.id === updated.id ? updated : passenger,
            ),
          }
        : current,
    );
  }
}
