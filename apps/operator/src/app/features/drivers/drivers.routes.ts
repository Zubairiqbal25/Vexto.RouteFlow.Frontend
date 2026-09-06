import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./drivers.page').then((m) => m.DriversPage),
    title: 'Drivers · Vexto',
  },
];
