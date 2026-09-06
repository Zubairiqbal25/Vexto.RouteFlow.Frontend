import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { VxAuthShell, VxLoginPage, VxMobileShell } from '@vexto/layouts';

/** The driver app has one section, so the shell carries no tab bar. */
@Component({
  selector: 'vexto-driver-shell',
  imports: [VxMobileShell],
  template: '<vx-mobile-shell title="Vexto Driver" />',
})
export class DriverShell {}

export const routes: Routes = [
  {
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],
    children: [
      {
        path: 'login',
        component: VxLoginPage,
        // Route data is bound to the component's inputs by withComponentInputBinding.
        data: {
          home: '/trips',
          subtitle: 'Sign in to see the trips assigned to you today.',
          footnote: 'Your operator creates driver accounts. Ask your dispatcher if you cannot sign in.',
        },
        title: 'Sign in · Vexto Driver',
      },
    ],
  },
  {
    path: '',
    component: DriverShell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'trips' },
      {
        path: 'trips',
        loadComponent: () => import('./features/trips/trips.page').then((m) => m.DriverTripsPage),
        title: "Today's trips · Vexto Driver",
      },
      {
        path: 'trips/:tripId',
        loadComponent: () =>
          import('./features/trips/trip.page').then((m) => m.DriverTripPage),
        title: 'Trip · Vexto Driver',
      },
      { path: '**', redirectTo: 'trips' },
    ],
  },
];
