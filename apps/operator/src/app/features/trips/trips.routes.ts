import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./trips.page').then((m) => m.TripsPage),
    title: 'Trips · Vexto',
  },
  {
    path: ':tripId',
    loadComponent: () => import('./trip-detail.page').then((m) => m.TripDetailPage),
    title: 'Trip · Vexto',
  },
];
