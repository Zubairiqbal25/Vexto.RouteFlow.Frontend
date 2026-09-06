import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./routes.page').then((m) => m.RoutesPage),
    title: 'Routes · Vexto',
  },
  {
    // `withComponentInputBinding` turns :routeId into a component input, so the detail page never
    // reads the ActivatedRoute snapshot itself.
    path: ':routeId',
    loadComponent: () => import('./route-detail.page').then((m) => m.RouteDetailPage),
    title: 'Route · Vexto',
  },
];
