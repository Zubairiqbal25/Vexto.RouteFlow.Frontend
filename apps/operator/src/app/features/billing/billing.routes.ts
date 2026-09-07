import type { Routes } from '@angular/router';
import { VextoPermissions, permissionGuard } from '@vexto/permissions';

/**
 * The operator's money screens.
 *
 * Split by permission rather than lumped under one guard, because the two are genuinely different
 * jobs: `Billing.*` decides what somebody will be charged, and `Payments.*` handles money that has
 * already moved. A clerk can be given the first without the second, and a dispatcher holds neither.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'invoices' },
  {
    path: 'subscriptions',
    canActivate: [permissionGuard(VextoPermissions.Billing.View)],
    loadComponent: () =>
      import('./subscriptions.page').then((m) => m.PassengerSubscriptionsPage),
    title: 'Passenger subscriptions · Vexto',
  },
  {
    path: 'invoices',
    canActivate: [permissionGuard(VextoPermissions.Billing.View)],
    loadComponent: () => import('./invoices.page').then((m) => m.PassengerInvoicesPage),
    title: 'Invoices · Vexto',
  },
  {
    path: 'payments',
    canActivate: [permissionGuard(VextoPermissions.Payments.View)],
    loadComponent: () => import('./payments.page').then((m) => m.PaymentsPage),
    title: 'Payments · Vexto',
  },
  {
    path: 'account',
    canActivate: [permissionGuard(VextoPermissions.Payments.View)],
    loadComponent: () => import('./payment-account.page').then((m) => m.PaymentAccountPage),
    title: 'Payment account · Vexto',
  },
];
