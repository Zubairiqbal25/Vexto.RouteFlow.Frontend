/**
 * Status vocabularies and the one place that decides how each one looks.
 *
 * The API serialises enums as their names, so these unions mirror the backend enums exactly. They
 * are written out rather than generated because the OpenAPI document types most `status` fields as
 * a plain string — the names are the contract either way, and a typo here is a compile error.
 *
 * `statusTone` exists so a status is coloured identically on the dashboard, in a table and in a
 * detail header. A feature that invents its own mapping is a bug.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export type PassengerStatus = 'Pending' | 'Active' | 'Inactive' | 'Suspended';
export type DriverStatus = 'Pending' | 'Active' | 'Inactive' | 'Suspended';
export type VehicleStatus = 'Active' | 'Inactive' | 'Maintenance' | 'Suspended';
export type UserStatus = 'Active' | 'Inactive' | 'Suspended' | 'PendingInvitation';
export type TenantStatus = 'Pending' | 'Active' | 'Suspended' | 'Inactive';
export type RouteStatus = 'Draft' | 'Active' | 'Inactive' | 'Suspended';
export type TripStatus = 'Scheduled' | 'Ready' | 'Started' | 'Completed' | 'Cancelled';
export type TripPassengerStatus =
  | 'Expected'
  | 'Skipped'
  | 'Cancelled'
  | 'Boarded'
  | 'NoShow'
  | 'DroppedOff';
export type TrackingStatus = 'NotStarted' | 'Live' | 'Stale' | 'Offline' | 'Completed';
export type AgreementStatus =
  | 'Draft'
  | 'PendingSignature'
  | 'Active'
  | 'Expired'
  | 'Terminated'
  | 'Cancelled';
export type AbsenceStatus = 'Active' | 'Cancelled';

/**
 * Whether a passenger may travel, as far as money is concerned.
 *
 * Mirrors `PassengerTransportAccess`. Note what it is not: this is transport access, not account
 * access — a blocked passenger still signs in, reads their invoice and pays it, because that is the
 * only place they can settle the thing that blocked them.
 */
export type PassengerAccessState = 'Active' | 'GracePeriod' | 'PaymentOverdue' | 'Blocked';

const TONES: Readonly<Record<string, StatusTone>> = {
  // Healthy, in-service, finished-as-intended.
  Active: 'success',
  Live: 'success',
  Boarded: 'success',
  DroppedOff: 'success',
  Started: 'success',

  // Waiting on someone or something.
  Pending: 'warning',
  PendingSignature: 'warning',
  PendingInvitation: 'warning',
  Stale: 'warning',
  Maintenance: 'warning',
  Ready: 'warning',

  // Something went wrong or was refused.
  Suspended: 'danger',
  NoShow: 'danger',
  Cancelled: 'danger',
  Offline: 'danger',

  // In flight, informational.
  Scheduled: 'info',
  Expected: 'info',

  // Dormant.
  Inactive: 'neutral',
  Draft: 'neutral',
  Expired: 'neutral',
  Terminated: 'neutral',
  Skipped: 'neutral',
  NotStarted: 'neutral',
  Completed: 'primary',

  // Transport access. GracePeriod and PaymentOverdue are both "somebody owes money and is still
  // travelling", which is a warning; Blocked is the only one that changes what happens at the kerb.
  GracePeriod: 'warning',
  PaymentOverdue: 'warning',
  Blocked: 'danger',
};

/** The tone a status is drawn in. Unknown values fall back to neutral rather than disappearing. */
export function statusTone(status: string | null | undefined): StatusTone {
  return (status && TONES[status]) || 'neutral';
}

/** Labels that read better than the enum name. Anything absent is humanised automatically. */
const LABELS: Readonly<Record<string, string>> = {
  PendingInvitation: 'Invited',
  PendingSignature: 'Pending signature',
  NoShow: 'No show',
  DroppedOff: 'Dropped off',
  NotStarted: 'Not started',
  GracePeriod: 'In grace period',
  PaymentOverdue: 'Payment overdue',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) {
    return 'Unknown';
  }

  return LABELS[status] ?? status.replace(/([a-z0-9])([A-Z])/gu, '$1 $2');
}

/**
 * True when the passenger is not to be carried.
 *
 * One function rather than `state === 'Blocked'` scattered through the apps: the driver's screen,
 * the operator's manifest and the passenger list all have to agree, and three literals eventually
 * do not.
 */
export function isAccessBlocked(state: string | null | undefined): boolean {
  return state === 'Blocked';
}

/** True while a trip is something a dispatcher needs to watch rather than file away. */
export function isTripLive(status: string | null | undefined): boolean {
  return status === 'Started';
}

/** True once attendance can no longer change. */
export function isTripClosed(status: string | null | undefined): boolean {
  return status === 'Completed' || status === 'Cancelled';
}
