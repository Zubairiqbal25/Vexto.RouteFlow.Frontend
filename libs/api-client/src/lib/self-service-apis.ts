import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AcceptInvitationCommand,
  ActiveFleetTrip,
  AuthenticatedUser,
  AuthenticationResponse,
  DeclareAbsenceRequest,
  DriverNextStop,
  DriverTrip,
  DriverTripDetail,
  InvitationValidation,
  NotificationItem,
  NotificationsRead,
  PagedResult,
  PassengerAbsenceResponse,
  PassengerAbsenceResult,
  PassengerEta,
  PassengerInvoice,
  PassengerInvoiceStatus,
  PassengerProfile,
  PassengerTrip,
  Payment,
  PaymentIntent,
  PublishTripLocationRequest,
  PushDevice,
  RecordTripLocationResponse,
  RegisterPushDeviceCommand,
  TripLocation,
  TripLocationHistory,
  TripPassenger,
  TripResponse,
  UnreadNotificationCount,
} from '@vexto/models';
import { VextoHttp } from './vexto-http';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(VextoHttp);

  login(email: string, password: string): Observable<AuthenticationResponse> {
    return this.http.post('/api/v1/auth/login', { email, password });
  }

  refresh(refreshToken: string): Observable<AuthenticationResponse> {
    return this.http.post('/api/v1/auth/refresh', { refreshToken });
  }

  logout(refreshToken: string): Observable<void> {
    return this.http.post('/api/v1/auth/logout', { refreshToken });
  }

  me(): Observable<AuthenticatedUser> {
    return this.http.get('/api/v1/auth/me');
  }

  /**
   * Says whether an invitation link still works, without redeeming it.
   *
   * Anonymous, and deliberately uninformative about an invalid token: an unknown, expired, revoked
   * and already-used token all answer the same way, so this cannot be used to guess tokens.
   */
  validateInvitation(token: string): Observable<InvitationValidation> {
    return this.http.get(`/api/v1/auth/invitations/${encodeURIComponent(token)}/validate`);
  }

  /** Redeems an invitation by setting the account password. Returns no session: sign in after. */
  acceptInvitation(command: AcceptInvitationCommand): Observable<{ email: string }> {
    return this.http.post('/api/v1/auth/invitations/accept', command);
  }
}

/**
 * The notifications of the signed-in user, whoever they are.
 *
 * Shared by all three apps: operators, drivers and passengers all have a bell, and every route
 * resolves the recipient from the token, so there is no user id to pass and none to tamper with.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(VextoHttp);

  list(
    query: { unreadOnly?: boolean; pageNumber?: number; pageSize?: number } = {},
  ): Observable<PagedResult<NotificationItem>> {
    return this.http.get('/api/v1/notifications', { ...query });
  }

  /** For the badge. Its own endpoint so a count never has to fetch a list. */
  unreadCount(): Observable<UnreadNotificationCount> {
    return this.http.get('/api/v1/notifications/unread-count');
  }

  markRead(notificationId: string): Observable<NotificationItem> {
    return this.http.post(`/api/v1/notifications/${notificationId}/read`);
  }

  markAllRead(): Observable<NotificationsRead> {
    return this.http.post('/api/v1/notifications/read-all');
  }
}

/**
 * The devices the signed-in person wants notifications on.
 *
 * No user id in any call: the server resolves the owner from the token, so one person cannot
 * register a device against another. The response never contains the provider token — a device is
 * identified to its owner by platform, label and a short fingerprint.
 */
@Injectable({ providedIn: 'root' })
export class PushDevicesApi {
  private readonly http = inject(VextoHttp);

  list(): Observable<PushDevice[]> {
    return this.http.get('/api/v1/me/push-devices');
  }

  /**
   * Registers or refreshes this browser. Safe to call on every load: the same token updates the
   * row it already has rather than accumulating duplicates.
   */
  register(command: RegisterPushDeviceCommand): Observable<PushDevice> {
    return this.http.post('/api/v1/me/push-devices', command);
  }

  remove(deviceId: string): Observable<void> {
    return this.http.delete(`/api/v1/me/push-devices/${deviceId}`);
  }
}

@Injectable({ providedIn: 'root' })
export class TrackingApi {
  private readonly http = inject(VextoHttp);

  /**
   * Every trip the tenant currently has on the road, each with its last known position.
   *
   * One call for the whole Live Fleet screen: the alternative — a trips list followed by a position
   * request per vehicle — is the N+1 this endpoint exists to prevent.
   */
  activeFleet(): Observable<ActiveFleetTrip[]> {
    return this.http.get('/api/v1/tracking/active-fleet');
  }

  location(tripId: string): Observable<TripLocation> {
    return this.http.get(`/api/v1/trips/${tripId}/location`);
  }

  locationHistory(
    tripId: string,
    query: { fromUtc?: string; toUtc?: string } = {},
  ): Observable<TripLocationHistory> {
    return this.http.get(`/api/v1/trips/${tripId}/location-history`, { ...query });
  }
}

export interface DriverTripQuery {
  readonly serviceDate?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly status?: string;
  readonly pageNumber?: number;
  readonly pageSize?: number;
}

/**
 * The driver's own trips. Every route is `/driver/me/...` — a driver never passes their own id, so
 * there is nothing to tamper with.
 */
@Injectable({ providedIn: 'root' })
export class DriverApi {
  private readonly http = inject(VextoHttp);

  myTrips(query: DriverTripQuery = {}): Observable<PagedResult<DriverTrip>> {
    return this.http.get('/api/v1/driver/me/trips', { ...query });
  }

  myTrip(tripId: string): Observable<DriverTripDetail> {
    return this.http.get(`/api/v1/driver/me/trips/${tripId}`);
  }

  /**
   * The next stop with passengers still expected, and who is waiting there.
   *
   * `stop` is null once every pickup has been dealt with — a finished run rather than an error, so
   * the app shows the end of the route instead of a failure.
   */
  nextStop(tripId: string): Observable<DriverNextStop> {
    return this.http.get(`/api/v1/driver/me/trips/${tripId}/next-stop`);
  }

  start(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/driver/me/trips/${tripId}/start`);
  }

  complete(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/driver/me/trips/${tripId}/complete`);
  }

  board(tripId: string, tripPassengerId: string): Observable<TripPassenger> {
    return this.http.post(`/api/v1/driver/me/trips/${tripId}/passengers/${tripPassengerId}/board`);
  }

  markNoShow(tripId: string, tripPassengerId: string): Observable<TripPassenger> {
    return this.http.post(`/api/v1/driver/me/trips/${tripId}/passengers/${tripPassengerId}/no-show`);
  }

  dropOff(tripId: string, tripPassengerId: string): Observable<TripPassenger> {
    return this.http.post(
      `/api/v1/driver/me/trips/${tripId}/passengers/${tripPassengerId}/drop-off`,
    );
  }

  publishLocation(
    tripId: string,
    request: PublishTripLocationRequest,
  ): Observable<RecordTripLocationResponse> {
    return this.http.post(`/api/v1/driver/me/trips/${tripId}/location`, request);
  }
}

/** The passenger's own trips, position and absences. Same `me` shape, same reason. */
@Injectable({ providedIn: 'root' })
export class PassengerSelfApi {
  private readonly http = inject(VextoHttp);

  profile(): Observable<PassengerProfile> {
    return this.http.get('/api/v1/passenger/me');
  }

  myTrips(
    query: { fromDate?: string; toDate?: string; pageNumber?: number; pageSize?: number } = {},
  ): Observable<PagedResult<PassengerTrip>> {
    return this.http.get('/api/v1/passenger/me/trips', { ...query });
  }

  tripLocation(tripId: string): Observable<TripLocation> {
    return this.http.get(`/api/v1/passenger/me/trips/${tripId}/location`);
  }

  /**
   * When the bus is expected at this passenger own stop.
   *
   * Read `status` before anything else: a bus that is not reporting freshly produces no estimate
   * at all rather than a guess, and every other field is null in that case.
   */
  tripEta(tripId: string): Observable<PassengerEta> {
    return this.http.get(`/api/v1/passenger/me/trips/${tripId}/eta`);
  }

  myAbsences(
    query: { fromDate?: string; toDate?: string; includeCancelled?: boolean } = {},
  ): Observable<PassengerAbsenceResponse[]> {
    return this.http.get('/api/v1/passenger/me/absences', { ...query });
  }

  declareAbsence(request: DeclareAbsenceRequest): Observable<PassengerAbsenceResult> {
    return this.http.post('/api/v1/passenger/me/absences', request);
  }

  cancelAbsence(absenceId: string): Observable<PassengerAbsenceResponse> {
    return this.http.post(`/api/v1/passenger/me/absences/${absenceId}/cancel`);
  }
}

/**
 * A passenger's own invoices, and paying them.
 *
 * No method here takes a passenger id, and none takes an amount. The passenger comes from the
 * token and the amount comes from the invoice on the server — those two omissions are what make it
 * impossible to read somebody else's bill or to settle a 400 invoice for 1.
 */
@Injectable({ providedIn: 'root' })
export class PassengerInvoicesApi {
  private readonly http = inject(VextoHttp);

  invoices(query: { status?: PassengerInvoiceStatus; pageNumber?: number; pageSize?: number } = {}):
    Observable<PagedResult<PassengerInvoice>> {
    return this.http.get('/api/v1/passenger/me/invoices', { ...query });
  }

  invoice(invoiceId: string): Observable<PassengerInvoice> {
    return this.http.get(`/api/v1/passenger/me/invoices/${invoiceId}`);
  }

  /** Starts a payment. Deliberately sends no body: the amount is the server's to decide. */
  startPayment(invoiceId: string): Observable<PaymentIntent> {
    return this.http.post(`/api/v1/passenger/me/invoices/${invoiceId}/payment-intent`);
  }

  /**
   * The authoritative state of a payment.
   *
   * Polled while the provider confirms. The browser is never believed about the outcome — this
   * asks Vexto, which asks the provider.
   */
  payment(paymentId: string): Observable<Payment> {
    return this.http.get(`/api/v1/passenger/me/payments/${paymentId}`);
  }
}
