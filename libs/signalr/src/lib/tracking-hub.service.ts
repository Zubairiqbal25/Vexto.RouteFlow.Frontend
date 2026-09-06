import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '@vexto/auth';
import { VEXTO_CONFIG } from '@vexto/utilities';
import {
  HttpTransportType,
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { Subject } from 'rxjs';

/**
 * A live position, exactly as the server broadcasts it.
 *
 * Mirrors `TripLocationUpdated` on the backend, which is documented as a stable wire contract. It
 * carries no driver identity, which is why the same message can be sent to a dispatcher and to a
 * passenger.
 */
export interface TripLocationUpdate {
  readonly tripId: string;
  readonly vehicleId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKph: number | null;
  readonly headingDegrees: number | null;
  readonly recordedAtUtc: string;
  readonly trackingStatus: string;
}

export type HubStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * One SignalR connection per application.
 *
 * Components never touch a `HubConnection`: they read `status` and subscribe to `updates`. That is
 * what keeps hub plumbing out of fifteen screens, and it is why re-subscribing after a reconnect
 * can be handled in one place — the server clears group membership when a connection drops, so
 * every watched trip has to be re-watched, and forgetting that produces a map that silently stops
 * moving.
 *
 * Operators are joined to their tenant's fleet group by the server on connect; passengers join
 * nothing and watch one trip. Clients never name a group.
 */
@Injectable({ providedIn: 'root' })
export class TrackingHub {
  private readonly config = inject(VEXTO_CONFIG);
  private readonly auth = inject(AuthStore);

  private connection: HubConnection | null = null;
  private readonly watched = new Set<string>();
  private readonly updated = new Subject<TripLocationUpdate>();

  private readonly state = signal<HubStatus>('disconnected');

  /** Rendered as a Connected / Reconnecting / Offline chip so a stale map is never mistaken for a still one. */
  readonly status = this.state.asReadonly();

  readonly updates = this.updated.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => void this.stop());
  }

  /** Idempotent: repeated calls while connected or connecting do nothing. */
  async start(): Promise<void> {
    if (this.connection || !this.auth.isAuthenticated()) {
      return;
    }

    const connection = new HubConnectionBuilder()
      .withUrl(this.config.trackingHubUrl, {
        // The bearer token is read on every (re)connect, so a token refreshed mid-session is used.
        accessTokenFactory: () => this.auth.accessToken() ?? '',
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10_000, 30_000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('TripLocationUpdated', (update: TripLocationUpdate) => this.updated.next(update));

    connection.onreconnecting(() => this.state.set('reconnecting'));
    connection.onclose(() => this.state.set('disconnected'));
    connection.onreconnected(() => {
      this.state.set('connected');
      // Group membership does not survive a reconnect. Re-watch everything, or the map goes quiet.
      void this.rewatchAll();
    });

    this.connection = connection;
    this.state.set('connecting');

    try {
      await connection.start();
      this.state.set('connected');
      await this.rewatchAll();
    } catch {
      this.state.set('disconnected');
    }
  }

  /**
   * Follows one trip's positions.
   *
   * @returns whether the server granted the subscription — a passenger asking about someone else's
   *   trip is refused, and the UI should say so rather than waiting for updates that never come.
   */
  async watchTrip(tripId: string): Promise<boolean> {
    this.watched.add(tripId);

    if (this.connection?.state !== HubConnectionState.Connected) {
      await this.start();
    }

    if (this.connection?.state !== HubConnectionState.Connected) {
      return false;
    }

    try {
      return await this.connection.invoke<boolean>('WatchTrip', tripId);
    } catch {
      return false;
    }
  }

  async unwatchTrip(tripId: string): Promise<void> {
    this.watched.delete(tripId);

    if (this.connection?.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('UnwatchTrip', tripId);
      } catch {
        // Leaving a group we are about to disconnect from is not worth surfacing.
      }
    }
  }

  async stop(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.watched.clear();
    this.state.set('disconnected');

    if (connection) {
      try {
        await connection.stop();
      } catch {
        // Nothing useful to do about a failed close.
      }
    }
  }

  private async rewatchAll(): Promise<void> {
    for (const tripId of this.watched) {
      try {
        await this.connection?.invoke('WatchTrip', tripId);
      } catch {
        // A trip that has since finished will be refused; the next screen visit re-resolves it.
      }
    }
  }
}
