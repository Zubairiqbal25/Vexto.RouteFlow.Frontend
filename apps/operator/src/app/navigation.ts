import type { NavSection } from '@vexto/layouts';
import { VextoPermissions } from '@vexto/permissions';

/**
 * The operator portal's navigation, grouped by the job being done rather than by module.
 *
 * "Operations" is what a dispatcher opens at 5am; "People" and "Fleet" are what an administrator
 * maintains. Every item declares the permission that reveals it — the sidebar shows exactly what
 * the signed-in user is allowed to open, and nothing else.
 */
export const OPERATOR_NAV: readonly NavSection[] = [
  {
    items: [{ label: 'Dashboard', link: '/dashboard', icon: 'dashboard', exact: true }],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Trips',
        link: '/trips',
        icon: 'trips',
        permissions: [VextoPermissions.Trips.View],
      },
      {
        label: 'Routes',
        link: '/routes',
        icon: 'routes',
        permissions: [VextoPermissions.Routes.View],
      },
      {
        label: 'Live Fleet',
        link: '/live-fleet',
        icon: 'live',
        permissions: [VextoPermissions.Tracking.View],
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        label: 'Passengers',
        link: '/passengers',
        icon: 'passengers',
        permissions: [VextoPermissions.Passengers.View],
      },
      {
        label: 'Drivers',
        link: '/drivers',
        icon: 'drivers',
        permissions: [VextoPermissions.Drivers.View],
      },
    ],
  },
  {
    label: 'Fleet',
    items: [
      {
        label: 'Vehicles',
        link: '/vehicles',
        icon: 'vehicle',
        permissions: [VextoPermissions.Fleet.View],
      },
    ],
  },
  {
    label: 'Billing',
    items: [
      {
        label: 'Subscriptions',
        link: '/billing/subscriptions',
        icon: 'agreements',
        permissions: [VextoPermissions.Billing.View],
      },
      {
        label: 'Invoices',
        link: '/billing/invoices',
        icon: 'agreements',
        permissions: [VextoPermissions.Billing.View],
      },
      {
        label: 'Payments',
        link: '/billing/payments',
        icon: 'agreements',
        permissions: [VextoPermissions.Payments.View],
      },
      {
        label: 'Payment Account',
        link: '/billing/account',
        icon: 'settings',
        permissions: [VextoPermissions.Payments.View],
      },
    ],
  },
  {
    label: 'Management',
    items: [
      {
        label: 'Users',
        link: '/users',
        icon: 'users',
        permissions: [VextoPermissions.Users.View],
      },
      {
        label: 'Agreements',
        link: '/agreements',
        icon: 'agreements',
        permissions: [VextoPermissions.Agreements.View],
      },
    ],
  },
  {
    items: [{ label: 'Settings', link: '/settings', icon: 'settings' }],
  },
];
