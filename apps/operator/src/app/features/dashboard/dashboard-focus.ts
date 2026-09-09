import { computed, inject } from '@angular/core';
import { AuthStore } from '@vexto/auth';
import { PermissionService, VextoPermissions } from '@vexto/permissions';

/** The panels the operator dashboard is assembled from. */
export type DashboardSection =
  | 'operations'
  | 'trend'
  | 'attendance'
  | 'fleet-counts'
  | 'running'
  | 'upcoming'
  | 'money';

/** Which job the signed-in account is doing, as far as the dashboard needs to care. */
export type DashboardFocus = 'platform' | 'owner' | 'dispatch' | 'finance';

/**
 * The order each focus reads the dashboard in.
 *
 * **Same panels, different priority.** Section 19 of the operations brief is explicit that four
 * unrelated dashboards is the wrong answer: a dispatcher and an owner want the same facts, they
 * just want them in a different order, and building four screens means fixing every bug four times.
 * A finance user genuinely does not want a live-fleet panel at the top, so money leads for them and
 * the operational panels follow — but they are the same panels.
 *
 * Panels the account has no permission for are dropped by the page regardless of this order, so a
 * list here is a preference, never a grant.
 */
const ORDER: Readonly<Record<DashboardFocus, readonly DashboardSection[]>> = {
  // A platform administrator holds no tenant, so this order is only reached in a support context.
  platform: ['operations', 'running', 'upcoming', 'fleet-counts', 'trend', 'attendance', 'money'],
  owner: ['operations', 'trend', 'attendance', 'fleet-counts', 'money', 'running', 'upcoming'],
  dispatch: ['operations', 'running', 'upcoming', 'attendance', 'trend', 'fleet-counts', 'money'],
  finance: ['money', 'operations', 'trend', 'fleet-counts', 'attendance', 'running', 'upcoming'],
};

/**
 * What the signed-in account's dashboard should lead with.
 *
 * **Derived from permissions, not from a role name.** Roles are a way of granting permissions and
 * an operator is free to invent their own — "Depot supervisor", "Night controller" — so a screen
 * keyed on `role === 'Dispatcher'` is a screen that silently falls back to a generic layout for
 * every customer who did not use Vexto's exact vocabulary. The permission set is the thing the API
 * itself enforces, so it is the thing that decides.
 *
 * The tests are ordered narrowest-first: somebody who can manage billing *and* run the operation is
 * an owner, not a finance clerk.
 */
export function dashboardFocus(
  has: (permission: string) => boolean,
  isServiceAdmin: boolean,
  hasTenant: boolean,
): DashboardFocus {
  if (isServiceAdmin && !hasTenant) {
    return 'platform';
  }

  // An owner is recognised by holding the levers nobody else does: settings and user administration.
  if (has(VextoPermissions.Settings.Manage) || has(VextoPermissions.Users.Manage)) {
    return 'owner';
  }

  if (has(VextoPermissions.Trips.Manage) || has(VextoPermissions.Tracking.View)) {
    return 'dispatch';
  }

  if (has(VextoPermissions.Billing.View) || has(VextoPermissions.Payments.View)) {
    return 'finance';
  }

  return 'dispatch';
}

/**
 * The dashboard's section order for the current account, as a signal.
 *
 * Injected once by the page, so there is exactly one place in the product that decides what a given
 * permission set should see first.
 */
export function dashboardSections() {
  const permissions = inject(PermissionService);
  const auth = inject(AuthStore);

  const focus = computed(() =>
    dashboardFocus(
      (permission) => permissions.has(permission),
      permissions.isServiceAdmin(),
      auth.tenantName() !== null,
    ),
  );

  return {
    focus,
    order: computed(() => ORDER[focus()]),
  };
}
