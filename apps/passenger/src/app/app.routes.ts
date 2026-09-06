import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { type NavItem, VxAuthShell, VxLoginPage, VxMobileShell } from '@vexto/layouts';

const TABS: readonly NavItem[] = [
  { label: 'Home', link: '/home', icon: 'live', exact: true },
  { label: 'Trips', link: '/trips', icon: 'trips' },
  { label: 'Absences', link: '/absences', icon: 'calendar' },
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
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],
    children: [
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
      { path: '**', redirectTo: 'home' },
    ],
  },
];
