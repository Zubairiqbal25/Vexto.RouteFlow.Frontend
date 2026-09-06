import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { VxAdminShell, VxAuthShell, VxLoginPage } from '@vexto/layouts';
import { VextoPermissions, permissionGuard } from '@vexto/permissions';
import { OPERATOR_NAV } from './navigation';

/**
 * Two shells, one router.
 *
 * Everything signed-in hangs off `VxAdminShell` so the rail and top bar are mounted once and do not
 * flicker between pages. Feature areas are lazy — a dispatcher who never opens Agreements never
 * downloads it.
 */

/** Binds the navigation to the shared shell without a wrapper file per app. */
@Component({
  selector: 'vexto-operator-shell',
  imports: [VxAdminShell],
  template: '<vx-admin-shell [sections]="sections" />',
})
export class OperatorShell {
  protected readonly sections = OPERATOR_NAV;
}

export const routes: Routes = [
  {
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],
    children: [
      {
        path: 'login',
        component: VxLoginPage,
        data: { home: '/dashboard' },
        title: 'Sign in · Vexto',
      },
    ],
  },
  {
    path: '',
    component: OperatorShell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
        title: 'Dashboard · Vexto',
      },
      {
        path: 'passengers',
        canActivate: [permissionGuard(VextoPermissions.Passengers.View)],
        loadChildren: () => import('./features/passengers/passengers.routes').then((m) => m.routes),
      },
      {
        path: 'drivers',
        canActivate: [permissionGuard(VextoPermissions.Drivers.View)],
        loadChildren: () => import('./features/drivers/drivers.routes').then((m) => m.routes),
      },
      {
        path: 'vehicles',
        canActivate: [permissionGuard(VextoPermissions.Fleet.View)],
        loadChildren: () => import('./features/vehicles/vehicles.routes').then((m) => m.routes),
      },
      {
        path: 'routes',
        canActivate: [permissionGuard(VextoPermissions.Routes.View)],
        loadChildren: () => import('./features/routes/routes.routes').then((m) => m.routes),
      },
      {
        path: 'trips',
        canActivate: [permissionGuard(VextoPermissions.Trips.View)],
        loadChildren: () => import('./features/trips/trips.routes').then((m) => m.routes),
      },
      {
        path: 'live-fleet',
        canActivate: [permissionGuard(VextoPermissions.Tracking.View)],
        loadComponent: () =>
          import('./features/live-fleet/live-fleet.page').then((m) => m.LiveFleetPage),
        title: 'Live Fleet · Vexto',
      },
      {
        path: 'users',
        canActivate: [permissionGuard(VextoPermissions.Users.View)],
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
        title: 'Users · Vexto',
      },
      {
        path: 'agreements',
        canActivate: [permissionGuard(VextoPermissions.Agreements.View)],
        loadComponent: () =>
          import('./features/agreements/agreements.page').then((m) => m.AgreementsPage),
        title: 'Agreements · Vexto',
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
        title: 'Settings · Vexto',
      },
      {
        path: 'access-denied',
        loadComponent: () =>
          import('./features/shell/access-denied.page').then((m) => m.AccessDeniedPage),
        title: 'Access denied · Vexto',
      },
      {
        path: '**',
        loadComponent: () => import('./features/shell/not-found.page').then((m) => m.NotFoundPage),
        title: 'Not found · Vexto',
      },
    ],
  },
];
