import { Injectable, computed, inject } from '@angular/core';
import { AuthStore } from '@vexto/auth';

/**
 * The permission catalogue, mirroring `VextoPermissions` on the backend.
 *
 * Authorisation is enforced by the API; these constants decide what the UI *offers*. Offering an
 * action the server will refuse is the failure mode this prevents.
 */
export const VextoPermissions = {
  Tenants: { View: 'Tenants.View', Manage: 'Tenants.Manage' },
  Users: { View: 'Users.View', Manage: 'Users.Manage' },
  Agreements: { View: 'Agreements.View', Manage: 'Agreements.Manage' },
  Passengers: { View: 'Passengers.View', Manage: 'Passengers.Manage' },
  Fleet: { View: 'Fleet.View', Manage: 'Fleet.Manage' },
  Drivers: { View: 'Drivers.View', Manage: 'Drivers.Manage' },
  Routes: { View: 'Routes.View', Manage: 'Routes.Manage' },
  Trips: { View: 'Trips.View', Manage: 'Trips.Manage' },
  Tracking: { View: 'Tracking.View' },
  Dashboard: { View: 'Dashboard.View' },
  Settings: { View: 'Settings.View', Manage: 'Settings.Manage' },
  Notifications: { View: 'Notifications.View' },
  /* What somebody should be charged: subscriptions and invoices. */
  Billing: { View: 'Billing.View', Manage: 'Billing.Manage' },

  /* Money that has already moved: the payment list, and refunds. */
  Payments: { View: 'Payments.View', Manage: 'Payments.Manage' },
  Reports: { View: 'Reports.View' },
} as const;

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly store = inject(AuthStore);

  /** Exposed as a signal so navigation recomputes when the profile is refreshed. */
  readonly granted = this.store.permissions;

  readonly isPlatformAdmin = computed(() => this.store.user()?.isPlatformAdmin ?? false);

  has(permission: string): boolean {
    return this.granted().has(permission);
  }

  hasAny(...permissions: string[]): boolean {
    const granted = this.granted();

    return permissions.length === 0 || permissions.some((permission) => granted.has(permission));
  }

  hasAll(...permissions: string[]): boolean {
    const granted = this.granted();

    return permissions.every((permission) => granted.has(permission));
  }
}
