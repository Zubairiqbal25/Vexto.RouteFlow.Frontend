import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AddRouteStopRequest,
  AgreementDetailResponse,
  AgreementResponse,
  AssignPassengerRequest,
  AssignRouteResourcesRequest,
  ChangeTripResourcesRequest,
  CreateAgreementCommand,
  CreateDriverCommand,
  CreatePassengerCommand,
  CreateRouteCommand,
  CreateUserCommand,
  CreateVehicleCommand,
  DashboardSummary,
  DeclareAbsenceRequest,
  DriverInvitation,
  DriverInvitationStatus,
  DriverResponse,
  DriverUserAccount,
  GenerateTripsRequest,
  GenerateTripsResponse,
  InviteUserCommand,
  InviteUserResult,
  PagedResult,
  PassengerAbsenceResponse,
  PassengerAbsenceResult,
  PassengerInvitation,
  PassengerInvitationStatus,
  PassengerResponse,
  PassengerUserAccount,
  PickerOption,
  RouteDetailResponse,
  RouteListItem,
  RouteMapPreview,
  RoutePassengerAssignment,
  RouteResourceAssignment,
  RouteResponse,
  RouteSchedule,
  RouteScheduleRequest,
  RouteStop,
  RouteStopPosition,
  TenantSettings,
  TripAttendance,
  TripDetailResponse,
  TripResponse,
  UpdateAgreementCommand,
  UpdateDriverCommand,
  UpdatePassengerAssignmentRequest,
  UpdatePassengerCommand,
  UpdateRouteCommand,
  UpdateRouteStopRequest,
  UpdateTenantSettingsCommand,
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

/** A picker is a type-ahead: no page number, and a page size the server caps at 50. */
export interface PickerQuery {
  readonly search?: string;
  readonly pageSize?: number;
  /** Includes records that cannot currently be chosen, for a form editing an existing assignment. */
  readonly includeInactive?: boolean;
}

export interface VehiclePickerQuery {
  readonly search?: string;
  readonly pageSize?: number;
  readonly includeUnavailable?: boolean;
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

  /**
   * Server-side search for a form control.
   *
   * Forms use this rather than `list`, which is capped and would need paging to page 40 to find
   * somebody. The response is three fields per row, so a type-ahead over four thousand passengers
   * costs a few hundred bytes.
   */
  picker(query: PickerQuery = {}): Observable<PickerOption[]> {
    return this.http.get('/api/v1/passengers/picker', { ...query });
  }

  /* Invitations --------------------------------------------------------------------------------- */

  /**
   * Whether this passenger has an app login, and whether an outstanding link still works.
   *
   * Its own request rather than a field on the passenger, because only the detail screen needs it —
   * putting it on the shared response would make every row of a list pay for a status nothing on
   * that list displays.
   */
  invitationStatus(passengerId: string): Observable<PassengerInvitationStatus> {
    return this.http.get(`/api/v1/passengers/${passengerId}/invite`);
  }

  /**
   * Invites the passenger to the app. No password: they choose their own, and nobody else ever
   * knows it. The role and the link to this record are decided by the server.
   */
  invite(passengerId: string, email: string): Observable<PassengerInvitation> {
    return this.http.post(`/api/v1/passengers/${passengerId}/invite`, { email });
  }

  /** Sends the link again, replacing any outstanding one. Same account, same link, new token. */
  resendInvitation(passengerId: string): Observable<PassengerInvitation> {
    return this.http.post(`/api/v1/passengers/${passengerId}/invite/resend`);
  }

  revokeInvitation(passengerId: string): Observable<void> {
    return this.http.post(`/api/v1/passengers/${passengerId}/invite/revoke`);
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

  picker(query: PickerQuery = {}): Observable<PickerOption[]> {
    return this.http.get('/api/v1/drivers/picker', { ...query });
  }

  /* Invitations --------------------------------------------------------------------------------- */

  invitationStatus(driverId: string): Observable<DriverInvitationStatus> {
    return this.http.get(`/api/v1/drivers/${driverId}/invite`);
  }

  invite(driverId: string, email: string): Observable<DriverInvitation> {
    return this.http.post(`/api/v1/drivers/${driverId}/invite`, { email });
  }

  resendInvitation(driverId: string): Observable<DriverInvitation> {
    return this.http.post(`/api/v1/drivers/${driverId}/invite/resend`);
  }

  revokeInvitation(driverId: string): Observable<void> {
    return this.http.post(`/api/v1/drivers/${driverId}/invite/revoke`);
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

  picker(query: VehiclePickerQuery = {}): Observable<PickerOption[]> {
    return this.http.get('/api/v1/vehicles/picker', { ...query });
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

  /** Each row carries its stop, passenger and schedule counts, and whoever is rostered today. */
  list(query: RouteQuery = {}): Observable<PagedResult<RouteListItem>> {
    return this.http.get('/api/v1/routes', { ...query });
  }

  picker(query: PickerQuery = {}): Observable<PickerOption[]> {
    return this.http.get('/api/v1/routes/picker', { ...query });
  }

  /**
   * The stops in the order the operator planned, and the road path through them.
   *
   * Cached on the server, because route geometry barely changes and every miss is a billed call to
   * a routing provider. The polyline is opaque: it is handed to the map, never interpreted here.
   */
  mapPreview(routeId: string): Observable<RouteMapPreview> {
    return this.http.get(`/api/v1/routes/${routeId}/map-preview`);
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
  /** Matches a route code, a route name, a driver name or a plate — all snapshotted on the trip. */
  readonly search?: string;
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

  /**
   * Substitutes the driver and vehicle on this one trip.
   *
   * The route roster is left alone: the substitution is an exception to it, not a replacement for
   * it, and rewriting the roster would change every trip generated afterwards.
   */
  changeResources(tripId: string, request: ChangeTripResourcesRequest): Observable<TripResponse> {
    return this.http.put(`/api/v1/trips/${tripId}/resources`, request);
  }
}

/**
 * The operator morning picture, in one request.
 *
 * Replaces the five requests the dashboard used to make, one of which paged a hundred trips purely
 * to count them.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(VextoHttp);

  summary(): Observable<DashboardSummary> {
    return this.http.get('/api/v1/dashboard/summary');
  }
}

/** The tenant settings of the signed-in operator. There is no tenant id in either direction. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(VextoHttp);

  get(): Observable<TenantSettings> {
    return this.http.get('/api/v1/settings');
  }

  update(command: UpdateTenantSettingsCommand): Observable<TenantSettings> {
    return this.http.put('/api/v1/settings', command);
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

  /**
   * Creates the account and issues a one-shot link for the person to set their own password.
   *
   * Preferred over `create`, which makes an administrator invent a password for somebody else and
   * then transmit it somehow. The response carries the link only in Development.
   */
  invite(command: InviteUserCommand): Observable<InviteUserResult> {
    return this.http.post('/api/v1/users/invitations', command);
  }

  revokeInvitation(invitationId: string): Observable<void> {
    return this.http.post(`/api/v1/users/invitations/${invitationId}/revoke`);
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
