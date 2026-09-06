import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  ActiveFleetTrip,
  AuthenticatedUser,
  AuthenticationResponse,
  DeclareAbsenceRequest,
  DriverTrip,
  DriverTripDetail,
  PagedResult,
  PassengerAbsenceResponse,
  PassengerAbsenceResult,
  PassengerProfile,
  PassengerTrip,
  PublishTripLocationRequest,
  RecordTripLocationResponse,
  TripLocation,
  TripLocationHistory,
  TripPassenger,
  TripResponse,
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
