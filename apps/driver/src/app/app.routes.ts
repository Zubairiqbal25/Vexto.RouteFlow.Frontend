import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { VxAuthShell, VxLoginPage,
  VxAcceptInvitationPage, VxMobileShell } from '@vexto/layouts';

/** The driver app has one section, so the shell carries no tab bar. */
@Component({
  selector: 'vexto-driver-shell',
  imports: [VxMobileShell],
  template: '<vx-mobile-shell title="Vexto Driver" />',
})
export class DriverShell {}

export const routes: Routes = [
  {
    // Redeeming an invitation is deliberately outside the anonymous guard. Somebody who is already
    // signed in on this device may still be holding a link for a different account — a driver
    // setting up a passenger's phone, say — and bouncing them to the dashboard would strand it.
    path: 'accept-invitation',
    component: VxAcceptInvitationPage,
    title: 'Set your password · Vexto Driver',
  },
  {
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],

    // Where the guard sends somebody who is already signed in. It must not be '/', which is the
    // URL being guarded — see anonymousGuard.
    data: { home: '/trips' },
    children: [
      // Landing on '/' signed out must show the sign-in screen, not an empty auth shell.
      { path: '', pathMatch: 'full', redirectTo: 'login' },
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
