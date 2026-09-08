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
export type TenantPickerOption = Schema<'TenantPickerOption'>;
export type TenantBusinessDetails = Schema<'TenantBusinessDetailsPayload'>;
export type CreateTenantCommand = Schema<'CreateTenantCommand'>;
export type CreateTenantResult = Schema<'CreateTenantResult'>;
export type UpdateTenantCommand = Schema<'UpdateTenantCommand'>;

/**
 * A passenger's transport access as the operator sees it — the state plus the figures behind it.
 * The driver's manifest carries the state and nothing else; see `DriverManifestPassenger`.
 */
export type PassengerAccessStatus = Schema<'PassengerAccessStatusResponse'>;
export type OperatorPassengerAccess = Schema<'OperatorPassengerAccessResponse'>;
export type UserResponse = Schema<'UserResponse'>;
export type CreateUserCommand = Schema<'CreateUserCommand'>;
export type UpdateUserCommand = Schema<'UpdateUserCommand'>;

/** The operator's own settings, as opposed to the platform view of any tenant's. */
export type TenantSettings = Schema<'TenantSettingsResponse'>;
export type UpdateTenantSettingsCommand = Schema<'UpdateTenantSettingsCommand'>;

/* Invitations --------------------------------------------------------------------------------- */
export type InviteUserCommand = Schema<'InviteUserCommand'>;
export type InviteUserResult = Schema<'InviteUserResultResponse'>;
export type UserInvitation = Schema<'UserInvitationResponse'>;
export type InvitationValidation = Schema<'InvitationValidationResponse'>;
export type AcceptInvitationCommand = Schema<'AcceptInvitationCommand'>;

/** Passenger and driver invitations. One flow, one acceptance page, two entry points. */
export type PassengerInvitation = Schema<'PassengerInvitationResponse'>;
export type PassengerInvitationStatus = Schema<'PassengerInvitationStatusResponse'>;
export type DriverInvitation = Schema<'DriverInvitationResponse'>;
export type DriverInvitationStatus = Schema<'DriverInvitationStatusResponse'>;

/**
 * Where an account has got to on the way from invited to signing in. Derived on the server from
 * the account status plus whether a link is still live, so a client never has to work it out.
 */
export type AccountStatus =
  | 'NotInvited'
  | 'InvitationPending'
  | 'InvitationExpired'
  | 'Active'
  | 'Suspended';

/* Push devices -------------------------------------------------------------------------------- */
export type PushDevice = Schema<'PushDeviceResponse'>;
export type RegisterPushDeviceCommand = Schema<'RegisterPushDeviceCommand'>;

/* Dashboard ----------------------------------------------------------------------------------- */
export type DashboardSummary = Schema<'DashboardSummaryResponse'>;
export type DashboardToday = Schema<'DashboardTodayResponse'>;
export type DashboardTracking = Schema<'DashboardTrackingResponse'>;
export type DashboardAttendance = Schema<'DashboardAttendanceResponse'>;
export type DashboardTripTrend = Schema<'DashboardTripTrendResponse'>;
export type DashboardTrendPoint = Schema<'DashboardTrendPointResponse'>;

/** What a vehicle is running now and next. Batched per page; see VehicleOperationsEndpoints. */
export type VehicleOperations = Schema<'VehicleOperationsResponse'>;

/** A trip's manifest by outcome, on the list row so a board draws twenty bars in one request. */
export type TripAttendanceCounts = Schema<'TripAttendanceCountsResponse'>;

/**
 * One choice in a picker. Three fields on purpose — see the backend type: a picker is read by
 * anyone who may assign the thing, which is a wider audience than the one allowed to read the
 * record behind it.
 */
export type PickerOption = Schema<'PickerOption'>;

/* Notifications ------------------------------------------------------------------------------- */
export type NotificationItem = Schema<'NotificationResponse'>;
export type UnreadNotificationCount = Schema<'UnreadNotificationCountResponse'>;
export type NotificationsRead = Schema<'NotificationsReadResponse'>;

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
export type DriverTripDetail = Schema<'DriverTripManifestResponse'>;

/**
 * One row of the driver's manifest.
 *
 * Carries an operational `accessState` and no financial detail at all — the API deliberately
 * omits amounts, due dates and invoice numbers from a driver's payload.
 */
export type DriverManifestPassenger = Schema<'DriverManifestPassengerResponse'>;

/* Fleet --------------------------------------------------------------------------------------- */
export type VehicleResponse = Schema<'VehicleResponse'>;
export type CreateVehicleCommand = Schema<'CreateVehicleCommand'>;
export type UpdateVehicleCommand = Schema<'UpdateVehicleCommand'>;
export type VehicleType = Schema<'VehicleType'>;
export type Emirate = Schema<'Emirate'>;

/* Routes -------------------------------------------------------------------------------------- */
export type RouteResponse = Schema<'RouteResponse'>;
export type RouteDetailResponse = Schema<'RouteDetailResponse'>;

/** A route list row: the route plus the counts a planner reads without opening it. */
export type RouteListItem = Schema<'RouteListItemResponse'>;
export type RouteMapPreview = Schema<'RouteMapPreviewResponse'>;
export type RouteMapPreviewStop = Schema<'RouteMapPreviewStopResponse'>;
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
export type ChangeTripResourcesRequest = Schema<'ChangeTripResourcesRequest'>;
export type DriverNextStop = Schema<'DriverNextStopResponse'>;
export type DriverNextStopDetail = Schema<'DriverNextStopDetailResponse'>;

/* Tracking ------------------------------------------------------------------------------------ */
export type TripLocation = Schema<'TripLocationResponse'>;
export type TripLocationHistory = Schema<'TripLocationHistoryResponse'>;
export type TripLocationHistoryPoint = Schema<'TripLocationHistoryPointResponse'>;
export type ActiveFleetTrip = Schema<'ActiveFleetTripResponse'>;
export type PublishTripLocationRequest = Schema<'PublishTripLocationRequest'>;
export type RecordTripLocationResponse = Schema<'RecordTripLocationResponse'>;

/**
 * A passenger's arrival estimate. Everything below `status` is null unless the status is
 * `Available` — a bus that is not reporting produces no number at all rather than a guess.
 */
export type PassengerEta = Schema<'PassengerEtaResponse'>;

/* Problem details ----------------------------------------------------------------------------- */
export type ValidationProblem = Schema<'HttpValidationProblemDetails'>;

/* Passenger billing ---------------------------------------------------------------------------- */
/*
 * What a passenger owes their transport operator. Not to be confused with the Vexto subscription
 * types further down: that is what the operator owes Vexto, and the two are deliberately separate
 * all the way from the database to here.
 */
export type PassengerSubscription = Schema<'PassengerSubscriptionResponse'>;
export type PassengerSubscriptionStatus = Schema<'PassengerSubscriptionStatus'>;
export type PassengerBillingCycle = Schema<'PassengerBillingCycle'>;
export type CreatePassengerSubscriptionRequest = Schema<'CreatePassengerSubscriptionCommand'>;
export type UpdatePassengerSubscriptionRequest = Schema<'UpdatePassengerSubscriptionBody'>;

export type PassengerInvoice = Schema<'PassengerInvoiceResponse'>;
export type PassengerInvoiceItem = Schema<'PassengerInvoiceItemResponse'>;
export type PassengerInvoiceStatus = Schema<'PassengerInvoiceStatus'>;
export type GenerateInvoiceRequest = Schema<'GenerateInvoiceBody'>;
export type GenerateInvoiceBatchRequest = Schema<'GeneratePassengerInvoiceBatchCommand'>;
export type GenerateInvoiceBatchResponse = Schema<'GeneratePassengerInvoiceBatchResponse'>;

export type BillingSummary = Schema<'BillingSummaryResponse'>;

/* Payments ------------------------------------------------------------------------------------- */
export type PaymentAccount = Schema<'PaymentAccountResponse'>;
export type TenantPaymentSettings = Schema<'TenantPaymentSettingsResponse'>;
export type UpdateTenantPaymentSettingsRequest = Schema<'UpdateTenantPaymentSettingsCommand'>;

/**
 * What the browser needs to open the provider's payment sheet.
 *
 * `clientSecret` authorises confirming this one payment for this one amount. It is not a secret
 * key and is safe in a browser — but it must never be logged, and it is never persisted.
 */
export type PaymentIntent = Schema<'PaymentIntentResponse'>;
export type Payment = Schema<'PaymentResponse'>;
export type PaymentStatus = Schema<'PaymentStatus'>;
export type PaymentRefund = Schema<'RefundResponse'>;
export type RefundRequest = Schema<'RefundRequestBody'>;

/* Vexto SaaS subscription ---------------------------------------------------------------------- */
/* What the transport operator owes Vexto. The other kind of billing entirely. */
export type TenantSubscription = Schema<'TenantSubscriptionResponse'>;
export type PlanUsage = Schema<'PlanUsage'>;
