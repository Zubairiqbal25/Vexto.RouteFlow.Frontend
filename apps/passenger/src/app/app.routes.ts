import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { type NavItem, VxAuthShell, VxLoginPage,
  VxAcceptInvitationPage, VxMobileShell } from '@vexto/layouts';

const TABS: readonly NavItem[] = [
  { label: 'Home', link: '/home', icon: 'live', exact: true },
  { label: 'Trips', link: '/trips', icon: 'trips' },
  { label: 'Absences', link: '/absences', icon: 'calendar' },
  { label: 'Payments', link: '/payments', icon: 'agreements' },
];

@Component({
  selector: 'vexto-passenger-shell',
  imports: [VxMobileShell],
  template: '<vx-mobile-shell title="Vexto" [tabs]="tabs" />',
})
export class PassengerShell {
  protected readonly tabs = TABS;
}

export const routes: Routes = [
  {
    // Redeeming an invitation is deliberately outside the anonymous guard. Somebody who is already
    // signed in on this device may still be holding a link for a different account — a driver
    // setting up a passenger's phone, say — and bouncing them to the dashboard would strand it.
    path: 'accept-invitation',
    component: VxAcceptInvitationPage,
    title: 'Set your password · Vexto',
  },
  {
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],

    // Where the guard sends somebody who is already signed in. It must not be '/', which is the
    // URL being guarded — see anonymousGuard.
    data: { home: '/home' },
    children: [
      // Landing on '/' signed out must show the sign-in screen, not an empty auth shell.
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        component: VxLoginPage,
        data: {
          home: '/home',
          subtitle: 'Sign in to see your bus.',
          footnote: 'Your employer or transport operator creates your Vexto account.',
        },
        title: 'Sign in · Vexto',
      },
    ],
  },
  {
    path: '',
    component: PassengerShell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.page').then((m) => m.PassengerHomePage),
        title: 'Your bus · Vexto',
      },
      {
        path: 'trips',
        loadComponent: () => import('./features/home/trips.page').then((m) => m.PassengerTripsPage),
        title: 'Your trips · Vexto',
      },
      {
        path: 'absences',
        loadComponent: () =>
          import('./features/home/absences.page').then((m) => m.PassengerAbsencesPage),
        title: 'Absences · Vexto',
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/billing/invoices.page').then((m) => m.PassengerInvoicesPage),
        title: 'Payments · Vexto',
      },
      {
        path: 'payments/:invoiceId',
        loadComponent: () =>
          import('./features/billing/invoice-detail.page').then(
            (m) => m.PassengerInvoiceDetailPage,
          ),
        title: 'Invoice · Vexto',
      },
      { path: '**', redirectTo: 'home' },
    ],
  },
];
