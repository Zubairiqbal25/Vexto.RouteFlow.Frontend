import { Injectable, computed, inject, signal } from '@angular/core';
import { DriverApi } from '@vexto/api-client';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { firstValueFrom } from 'rxjs';

export type LocationState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'unavailable' // the device could not get a fix
  | 'denied' // the driver refused permission
  | 'unsupported';

/**
 * Publishes the vehicle's position while a trip is running.
 *
 * Three rules shape this:
 *
 * 1. **Only during a trip.** Tracking starts when the driver starts the trip and stops when they
 *    complete it or leave the screen. A transport app that tracks a driver's phone outside their
 *    shift is not one an operator can defend.
 * 2. **Never overlapping.** A fix is sent only when the previous request has finished. On a weak
 *    connection a fixed-interval publisher builds a queue of stale positions, each arriving later
 *    and less true than the last.
 * 3. **A failed publish is not an error the driver sees.** The next fix, seconds later, replaces
 *    it. What the driver is told about is permission and hardware — the things they can act on.
 */
@Injectable({ providedIn: 'root' })
export class LocationPublisher {
  private readonly api = inject(DriverApi);
  private readonly config = inject(VEXTO_CONFIG);

  private watchId: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFix: GeolocationPosition | null = null;
  private publishing = false;
  private tripId: string | null = null;

  private readonly _state = signal<LocationState>('idle');
  private readonly _lastPublishedAt = signal<Date | null>(null);

  readonly state = this._state.asReadonly();
  readonly lastPublishedAt = this._lastPublishedAt.asReadonly();

  readonly isActive = computed(() => this._state() === 'active');

  readonly message = computed(() => {
    switch (this._state()) {
      case 'active':
        return 'Location active';
      case 'starting':
        return 'Getting your location…';
      case 'denied':
        return 'Location permission denied';
      case 'unavailable':
        return 'Location unavailable';
      case 'unsupported':
        return 'This device cannot share location';
      default:
        return 'Location off';
    }
  });

  start(tripId: string): void {
    if (this.tripId === tripId && this._state() !== 'idle') {
      return;
    }

    this.stop();

    if (!('geolocation' in navigator)) {
      this._state.set('unsupported');

      return;
    }

    this.tripId = tripId;
    this._state.set('starting');

    // A watch rather than repeated one-shot reads: the device keeps the GPS warm and hands us the
    // freshest fix it has, which is both more accurate and cheaper on battery.
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastFix = position;
        this._state.set('active');
      },
      (error) => {
        this._state.set(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );

    this.timer = setInterval(
      () => void this.publish(),
      Math.max(1, this.config.driverLocationIntervalSeconds) * 1000,
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.tripId = null;
    this.lastFix = null;
    this.publishing = false;
    this._state.set('idle');
  }

  private async publish(): Promise<void> {
    const tripId = this.tripId;
    const fix = this.lastFix;

    if (!tripId || !fix || this.publishing) {
      return;
    }

    this.publishing = true;

    try {
      await firstValueFrom(
        this.api.publishLocation(tripId, {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          accuracyMeters: fix.coords.accuracy ?? null,
          // The browser reports metres per second; the API takes km/h.
          speedKph: fix.coords.speed === null ? null : fix.coords.speed * 3.6,
          headingDegrees: fix.coords.heading,
          recordedAtUtc: new Date(fix.timestamp).toISOString(),
        }),
      );

      this._lastPublishedAt.set(new Date());
    } catch {
      // Deliberately silent — see rule 3 above.
    } finally {
      this.publishing = false;
    }
  }
}
