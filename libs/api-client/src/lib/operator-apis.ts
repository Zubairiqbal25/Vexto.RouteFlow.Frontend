import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AddRouteStopRequest,
  AgreementDetailResponse,
  AgreementResponse,
  AssignPassengerRequest,
  AssignRouteResourcesRequest,
  CreateAgreementCommand,
  CreateDriverCommand,
  CreatePassengerCommand,
  CreateRouteCommand,
  CreateUserCommand,
  CreateVehicleCommand,
  DeclareAbsenceRequest,
  DriverResponse,
  DriverUserAccount,
  GenerateTripsRequest,
  GenerateTripsResponse,
  PagedResult,
  PassengerAbsenceResponse,
  PassengerAbsenceResult,
  PassengerResponse,
  PassengerUserAccount,
  RouteDetailResponse,
  RoutePassengerAssignment,
  RouteResourceAssignment,
  RouteResponse,
  RouteSchedule,
  RouteScheduleRequest,
  RouteStop,
  RouteStopPosition,
  TripAttendance,
  TripDetailResponse,
  TripResponse,
  UpdateAgreementCommand,
  UpdateDriverCommand,
  UpdatePassengerAssignmentRequest,
  UpdatePassengerCommand,
  UpdateRouteCommand,
  UpdateRouteStopRequest,
  UpdateUserCommand,
  UpdateVehicleCommand,
  UserResponse,
  VehicleResponse,
} from '@vexto/models';
import { VextoHttp } from './vexto-http';

/**
 * One service per backend endpoint group.
 *
 * These are thin on purpose: a method is a URL, a verb and a type. Business decisions live in the
 * feature stores that call them, and no component ever constructs a URL.
 */

export interface PageQuery {
  readonly pageNumber?: number;
  readonly pageSize?: number;
}

export interface PassengerQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
}

@Injectable({ providedIn: 'root' })
export class PassengersApi {
  private readonly http = inject(VextoHttp);

  list(query: PassengerQuery = {}): Observable<PagedResult<PassengerResponse>> {
    return this.http.get('/api/v1/passengers', { ...query });
  }

  get(passengerId: string): Observable<PassengerResponse> {
    return this.http.get(`/api/v1/passengers/${passengerId}`);
  }

  create(command: CreatePassengerCommand): Observable<PassengerResponse> {
    return this.http.post('/api/v1/passengers', command);
  }

  update(passengerId: string, command: UpdatePassengerCommand): Observable<PassengerResponse> {
    return this.http.put(`/api/v1/passengers/${passengerId}`, command);
  }

  activate(passengerId: string): Observable<PassengerResponse> {
    return this.http.post(`/api/v1/passengers/${passengerId}/activate`);
  }

  deactivate(passengerId: string): Observable<PassengerResponse> {
    return this.http.post(`/api/v1/passengers/${passengerId}/deactivate`);
  }

  createUserAccount(
    passengerId: string,
    body: { email: string; password: string },
  ): Observable<PassengerUserAccount> {
    return this.http.post(`/api/v1/passengers/${passengerId}/create-user`, body);
  }

  absences(
    passengerId: string,
    query: { fromDate?: string; toDate?: string; includeCancelled?: boolean } = {},
  ): Observable<PassengerAbsenceResponse[]> {
    return this.http.get(`/api/v1/passengers/${passengerId}/absences`, { ...query });
  }

  declareAbsence(
    passengerId: string,
    request: DeclareAbsenceRequest,
  ): Observable<PassengerAbsenceResult> {
    return this.http.post(`/api/v1/passengers/${passengerId}/absences`, request);
  }

  cancelAbsence(passengerId: string, absenceId: string): Observable<PassengerAbsenceResponse> {
    return this.http.post(`/api/v1/passengers/${passengerId}/absences/${absenceId}/cancel`);
  }
}

export interface DriverQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
  /** ISO date. Narrows the list to licences expiring before it — the "renewals due" view. */
  readonly licenseExpiringBefore?: string;
}

@Injectable({ providedIn: 'root' })
export class DriversApi {
  private readonly http = inject(VextoHttp);

  list(query: DriverQuery = {}): Observable<PagedResult<DriverResponse>> {
    return this.http.get('/api/v1/drivers', { ...query });
  }

  get(driverId: string): Observable<DriverResponse> {
    return this.http.get(`/api/v1/drivers/${driverId}`);
  }

  create(command: CreateDriverCommand): Observable<DriverResponse> {
    return this.http.post('/api/v1/drivers', command);
  }

  update(driverId: string, command: UpdateDriverCommand): Observable<DriverResponse> {
    return this.http.put(`/api/v1/drivers/${driverId}`, command);
  }

  activate(driverId: string): Observable<DriverResponse> {
    return this.http.post(`/api/v1/drivers/${driverId}/activate`);
  }

  deactivate(driverId: string): Observable<DriverResponse> {
    return this.http.post(`/api/v1/drivers/${driverId}/deactivate`);
  }

  suspend(driverId: string): Observable<DriverResponse> {
    return this.http.post(`/api/v1/drivers/${driverId}/suspend`);
  }

  createUserAccount(
    driverId: string,
    body: { email: string; password: string },
  ): Observable<DriverUserAccount> {
    return this.http.post(`/api/v1/drivers/${driverId}/create-user`, body);
  }
}

export interface VehicleQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
  readonly vehicleType?: string;
}

@Injectable({ providedIn: 'root' })
export class VehiclesApi {
  private readonly http = inject(VextoHttp);

  list(query: VehicleQuery = {}): Observable<PagedResult<VehicleResponse>> {
    return this.http.get('/api/v1/vehicles', { ...query });
  }

  get(vehicleId: string): Observable<VehicleResponse> {
    return this.http.get(`/api/v1/vehicles/${vehicleId}`);
  }

  create(command: CreateVehicleCommand): Observable<VehicleResponse> {
    return this.http.post('/api/v1/vehicles', command);
  }

  update(vehicleId: string, command: UpdateVehicleCommand): Observable<VehicleResponse> {
    return this.http.put(`/api/v1/vehicles/${vehicleId}`, command);
  }

  activate(vehicleId: string): Observable<VehicleResponse> {
    return this.http.post(`/api/v1/vehicles/${vehicleId}/activate`);
  }

  deactivate(vehicleId: string): Observable<VehicleResponse> {
    return this.http.post(`/api/v1/vehicles/${vehicleId}/deactivate`);
  }

  sendToMaintenance(vehicleId: string): Observable<VehicleResponse> {
    return this.http.post(`/api/v1/vehicles/${vehicleId}/maintenance`);
  }
}

export interface RouteQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
  readonly direction?: string;
}

@Injectable({ providedIn: 'root' })
export class RoutesApi {
  private readonly http = inject(VextoHttp);

  list(query: RouteQuery = {}): Observable<PagedResult<RouteResponse>> {
    return this.http.get('/api/v1/routes', { ...query });
  }

  /** Route plus its counts and current driver/vehicle — one call, which the header needs whole. */
  get(routeId: string): Observable<RouteDetailResponse> {
    return this.http.get(`/api/v1/routes/${routeId}`);
  }

  create(command: CreateRouteCommand): Observable<RouteResponse> {
    return this.http.post('/api/v1/routes', command);
  }

  update(routeId: string, command: UpdateRouteCommand): Observable<RouteResponse> {
    return this.http.put(`/api/v1/routes/${routeId}`, command);
  }

  activate(routeId: string): Observable<RouteResponse> {
    return this.http.post(`/api/v1/routes/${routeId}/activate`);
  }

  deactivate(routeId: string): Observable<RouteResponse> {
    return this.http.post(`/api/v1/routes/${routeId}/deactivate`);
  }

  generateTrips(routeId: string, request: GenerateTripsRequest): Observable<GenerateTripsResponse> {
    return this.http.post(`/api/v1/routes/${routeId}/generate-trips`, request);
  }

  /* Stops --------------------------------------------------------------------------------------- */
  stops(routeId: string, includeInactive = false): Observable<RouteStop[]> {
    return this.http.get(`/api/v1/routes/${routeId}/stops`, { includeInactive });
  }

  addStop(routeId: string, request: AddRouteStopRequest): Observable<RouteStop> {
    return this.http.post(`/api/v1/routes/${routeId}/stops`, request);
  }

  updateStop(
    routeId: string,
    stopId: string,
    request: UpdateRouteStopRequest,
  ): Observable<RouteStop> {
    return this.http.put(`/api/v1/routes/${routeId}/stops/${stopId}`, request);
  }

  removeStop(routeId: string, stopId: string): Observable<void> {
    return this.http.delete(`/api/v1/routes/${routeId}/stops/${stopId}`);
  }

  /** The whole new order in one request, so a drag never leaves the sequence half-applied. */
  reorderStops(routeId: string, positions: RouteStopPosition[]): Observable<RouteStop[]> {
    return this.http.post(`/api/v1/routes/${routeId}/stops/reorder`, positions);
  }

  /* Passengers ---------------------------------------------------------------------------------- */
  passengers(routeId: string, includeWithdrawn = false): Observable<RoutePassengerAssignment[]> {
    return this.http.get(`/api/v1/routes/${routeId}/passengers`, { includeWithdrawn });
  }

  assignPassenger(
    routeId: string,
    request: AssignPassengerRequest,
  ): Observable<RoutePassengerAssignment> {
    return this.http.post(`/api/v1/routes/${routeId}/passengers`, request);
  }

  updatePassengerAssignment(
    routeId: string,
    assignmentId: string,
    request: UpdatePassengerAssignmentRequest,
  ): Observable<RoutePassengerAssignment> {
    return this.http.put(`/api/v1/routes/${routeId}/passengers/${assignmentId}`, request);
  }

  removePassengerAssignment(routeId: string, assignmentId: string): Observable<void> {
    return this.http.delete(`/api/v1/routes/${routeId}/passengers/${assignmentId}`);
  }

  /* Resources ----------------------------------------------------------------------------------- */
  resources(routeId: string, includeWithdrawn = false): Observable<RouteResourceAssignment[]> {
    return this.http.get(`/api/v1/routes/${routeId}/resources`, { includeWithdrawn });
  }

  assignResources(
    routeId: string,
    request: AssignRouteResourcesRequest,
  ): Observable<RouteResourceAssignment> {
    return this.http.post(`/api/v1/routes/${routeId}/resources`, request);
  }

  updateResourceAssignment(
    routeId: string,
    assignmentId: string,
    request: AssignRouteResourcesRequest,
  ): Observable<RouteResourceAssignment> {
    return this.http.put(`/api/v1/routes/${routeId}/resources/${assignmentId}`, request);
  }

  removeResourceAssignment(routeId: string, assignmentId: string): Observable<void> {
    return this.http.delete(`/api/v1/routes/${routeId}/resources/${assignmentId}`);
  }

  /* Schedules ----------------------------------------------------------------------------------- */
  schedules(routeId: string, includeInactive = false): Observable<RouteSchedule[]> {
    return this.http.get(`/api/v1/routes/${routeId}/schedules`, { includeInactive });
  }

  addSchedule(routeId: string, request: RouteScheduleRequest): Observable<RouteSchedule> {
    return this.http.post(`/api/v1/routes/${routeId}/schedules`, request);
  }

  updateSchedule(
    routeId: string,
    scheduleId: string,
    request: RouteScheduleRequest,
  ): Observable<RouteSchedule> {
    return this.http.put(`/api/v1/routes/${routeId}/schedules/${scheduleId}`, request);
  }

  removeSchedule(routeId: string, scheduleId: string): Observable<void> {
    return this.http.delete(`/api/v1/routes/${routeId}/schedules/${scheduleId}`);
  }
}

export interface TripQuery extends PageQuery {
  readonly serviceDate?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly routeId?: string;
  readonly driverId?: string;
  readonly vehicleId?: string;
  readonly status?: string;
}

@Injectable({ providedIn: 'root' })
export class TripsApi {
  private readonly http = inject(VextoHttp);

  list(query: TripQuery = {}): Observable<PagedResult<TripResponse>> {
    return this.http.get('/api/v1/trips', { ...query });
  }

  get(tripId: string): Observable<TripDetailResponse> {
    return this.http.get(`/api/v1/trips/${tripId}`);
  }

  attendance(tripId: string): Observable<TripAttendance> {
    return this.http.get(`/api/v1/trips/${tripId}/attendance`);
  }

  markReady(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/trips/${tripId}/ready`);
  }

  cancel(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/trips/${tripId}/cancel`);
  }

  start(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/trips/${tripId}/start`);
  }

  complete(tripId: string): Observable<TripResponse> {
    return this.http.post(`/api/v1/trips/${tripId}/complete`);
  }

  board(tripId: string, tripPassengerId: string): Observable<TripAttendance> {
    return this.http.post(`/api/v1/trips/${tripId}/passengers/${tripPassengerId}/board`);
  }

  markNoShow(tripId: string, tripPassengerId: string): Observable<TripAttendance> {
    return this.http.post(`/api/v1/trips/${tripId}/passengers/${tripPassengerId}/no-show`);
  }

  dropOff(tripId: string, tripPassengerId: string): Observable<TripAttendance> {
    return this.http.post(`/api/v1/trips/${tripId}/passengers/${tripPassengerId}/drop-off`);
  }
}

export interface UserQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(VextoHttp);

  list(query: UserQuery = {}): Observable<PagedResult<UserResponse>> {
    return this.http.get('/api/v1/users', { ...query });
  }

  get(userId: string): Observable<UserResponse> {
    return this.http.get(`/api/v1/users/${userId}`);
  }

  create(command: CreateUserCommand): Observable<UserResponse> {
    return this.http.post('/api/v1/users', command);
  }

  update(userId: string, command: UpdateUserCommand): Observable<UserResponse> {
    return this.http.put(`/api/v1/users/${userId}`, command);
  }

  activate(userId: string): Observable<UserResponse> {
    return this.http.post(`/api/v1/users/${userId}/activate`);
  }

  suspend(userId: string): Observable<UserResponse> {
    return this.http.post(`/api/v1/users/${userId}/suspend`);
  }
}

export interface AgreementQuery extends PageQuery {
  readonly search?: string;
  readonly status?: string;
  readonly type?: string;
  readonly startsOnOrAfter?: string;
  readonly startsOnOrBefore?: string;
}

@Injectable({ providedIn: 'root' })
export class AgreementsApi {
  private readonly http = inject(VextoHttp);

  list(query: AgreementQuery = {}): Observable<PagedResult<AgreementResponse>> {
    return this.http.get('/api/v1/agreements', { ...query });
  }

  get(agreementId: string): Observable<AgreementDetailResponse> {
    return this.http.get(`/api/v1/agreements/${agreementId}`);
  }

  create(command: CreateAgreementCommand): Observable<AgreementResponse> {
    return this.http.post('/api/v1/agreements', command);
  }

  update(agreementId: string, command: UpdateAgreementCommand): Observable<AgreementResponse> {
    return this.http.put(`/api/v1/agreements/${agreementId}`, command);
  }

  activate(agreementId: string, signedDate: string | null): Observable<AgreementResponse> {
    return this.http.post(`/api/v1/agreements/${agreementId}/activate`, { signedDate });
  }

  terminate(agreementId: string, reason: string | null): Observable<AgreementResponse> {
    return this.http.post(`/api/v1/agreements/${agreementId}/terminate`, { reason });
  }
}
