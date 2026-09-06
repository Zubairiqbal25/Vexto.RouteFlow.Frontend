import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./vehicles.page').then((m) => m.VehiclesPage),
    title: 'Vehicles · Vexto',
  },
];
