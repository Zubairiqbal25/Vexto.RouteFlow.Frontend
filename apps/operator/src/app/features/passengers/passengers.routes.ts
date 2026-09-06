import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./passengers.page').then((m) => m.PassengersPage),
    title: 'Passengers · Vexto',
  },
];
