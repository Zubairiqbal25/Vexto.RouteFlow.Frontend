import type { components } from './generated/vexto-api';

/**
 * The backend contract, re-exported under names the application actually uses.
 *
 * Nothing here is hand-written: every type below resolves to a schema in the generated OpenAPI
 * file, so a backend rename becomes a compile error rather than a runtime surprise. Re-exporting
 * matters because features should import `PassengerResponse` from `@vexto/models`, not reach into
 * a generated file whose shape is an implementation detail of the generator.
 */

type RawSchemas = components['schemas'];

/**
 * The .NET OpenAPI document describes numbers as `number | string`, because System.Text.Json will
 * accept either on the wire. It never sends a string, and a template that has to defend against one
 * is unreadable — so the union is narrowed back to `number`, recursively, exactly once.
 *
 * Every branch tests `[V] extends [...]` rather than `V extends ...`: a naked type parameter makes a
 * conditional distribute over the union, which would test `number` and `string` separately and leave
 * the `string` half intact — defeating the whole point.
 */
type Narrow<V> = [V] extends [readonly (infer E)[]]
  ? Narrow<E>[]
  : [NonNullable<V>] extends [object]
    ? { [K in keyof NonNullable<V>]: Narrow<NonNullable<V>[K]> } | Extract<V, null | undefined>
    : [Extract<V, number>] extends [never]
      ? V
      : Exclude<V, string>;

type Schema<K extends keyof RawSchemas> = Narrow<RawSchemas[K]>;

/* Authentication ------------------------------------------------------------------------------ */
export type AuthenticationResponse = Schema<'AuthenticationResponse'>;
export type AuthenticatedUser = Schema<'AuthenticatedUserResponse'>;
export type LoginCommand = Schema<'LoginCommand'>;

/* Paging -------------------------------------------------------------------------------------- */
export interface PagedResult<T> {
  readonly items: T[];
  readonly pageNumber: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages?: number;
}

/* Tenancy and users --------------------------------------------------------------------------- */
export type TenantResponse = Schema<'TenantResponse'>;
export type TenantDetailResponse = Schema<'TenantDetailResponse'>;
export type UserResponse = Schema<'UserResponse'>;
export type CreateUserCommand = Schema<'CreateUserCommand'>;
export type UpdateUserCommand = Schema<'UpdateUserCommand'>;

/* Agreements ---------------------------------------------------------------------------------- */
export type AgreementResponse = Schema<'AgreementResponse'>;
export type AgreementDetailResponse = Schema<'AgreementDetailResponse'>;
export type AgreementType = Schema<'AgreementType'>;
export type CreateAgreementCommand = Schema<'CreateAgreementCommand'>;
export type UpdateAgreementCommand = Schema<'UpdateAgreementCommand'>;

/* Passengers ---------------------------------------------------------------------------------- */
export type PassengerResponse = Schema<'PassengerResponse'>;
export type CreatePassengerCommand = Schema<'CreatePassengerCommand'>;
export type UpdatePassengerCommand = Schema<'UpdatePassengerCommand'>;
export type PassengerAbsenceResponse = Schema<'PassengerAbsenceResponse'>;
export type PassengerAbsenceResult = Schema<'PassengerAbsenceResultResponse'>;
export type DeclareAbsenceRequest = Schema<'DeclareAbsenceRequest'>;
export type PassengerProfile = Schema<'PassengerProfileResponse'>;
export type PassengerTrip = Schema<'PassengerTripResponse'>;
export type PassengerUserAccount = Schema<'PassengerUserAccountResponse'>;

/* Drivers ------------------------------------------------------------------------------------- */
export type DriverResponse = Schema<'DriverResponse'>;
export type CreateDriverCommand = Schema<'CreateDriverCommand'>;
export type UpdateDriverCommand = Schema<'UpdateDriverCommand'>;
export type DriverUserAccount = Schema<'DriverUserAccountResponse'>;
export type DriverTrip = Schema<'DriverTripResponse'>;
export type DriverTripDetail = Schema<'DriverTripDetailResponse'>;

/* Fleet --------------------------------------------------------------------------------------- */
export type VehicleResponse = Schema<'VehicleResponse'>;
export type CreateVehicleCommand = Schema<'CreateVehicleCommand'>;
export type UpdateVehicleCommand = Schema<'UpdateVehicleCommand'>;
export type VehicleType = Schema<'VehicleType'>;
export type Emirate = Schema<'Emirate'>;

/* Routes -------------------------------------------------------------------------------------- */
export type RouteResponse = Schema<'RouteResponse'>;
export type RouteDetailResponse = Schema<'RouteDetailResponse'>;
export type RouteSummary = Schema<'RouteSummaryResponse'>;
export type CreateRouteCommand = Schema<'CreateRouteCommand'>;
export type UpdateRouteCommand = Schema<'UpdateRouteCommand'>;
export type RouteDirection = Schema<'RouteDirection'>;
export type RouteStop = Schema<'RouteStopResponse'>;
export type RouteStopType = Schema<'RouteStopType'>;
export type AddRouteStopRequest = Schema<'AddRouteStopRequest'>;
export type UpdateRouteStopRequest = Schema<'UpdateRouteStopRequest'>;
export type RouteStopPosition = Schema<'RouteStopPosition'>;
export type RoutePassengerAssignment = Schema<'RoutePassengerAssignmentResponse'>;
export type AssignPassengerRequest = Schema<'AssignPassengerRequest'>;
export type UpdatePassengerAssignmentRequest = Schema<'UpdatePassengerAssignmentRequest'>;
export type RouteResourceAssignment = Schema<'RouteResourceAssignmentResponse'>;
export type AssignRouteResourcesRequest = Schema<'AssignRouteResourcesRequest'>;
export type RouteAssignmentType = Schema<'RouteAssignmentType'>;
export type RouteSchedule = Schema<'RouteScheduleResponse'>;
export type RouteScheduleRequest = Schema<'RouteScheduleRequest'>;
export type GenerateTripsRequest = Schema<'GenerateTripsRequest'>;
export type GenerateTripsResponse = Schema<'GenerateTripsResponse'>;
export type ApiDayOfWeek = Schema<'DayOfWeek'>;

/* Trips --------------------------------------------------------------------------------------- */
export type TripResponse = Schema<'TripResponse'>;
export type TripDetailResponse = Schema<'TripDetailResponse'>;
export type TripPassenger = Schema<'TripPassengerResponse'>;
export type TripAttendance = Schema<'TripAttendanceResponse'>;
export type TripAttendanceSummary = Schema<'TripAttendanceSummaryResponse'>;

/* Tracking ------------------------------------------------------------------------------------ */
export type TripLocation = Schema<'TripLocationResponse'>;
export type TripLocationHistory = Schema<'TripLocationHistoryResponse'>;
export type TripLocationHistoryPoint = Schema<'TripLocationHistoryPointResponse'>;
export type ActiveFleetTrip = Schema<'ActiveFleetTripResponse'>;
export type PublishTripLocationRequest = Schema<'PublishTripLocationRequest'>;
export type RecordTripLocationResponse = Schema<'RecordTripLocationResponse'>;

/* Problem details ----------------------------------------------------------------------------- */
export type ValidationProblem = Schema<'HttpValidationProblemDetails'>;
