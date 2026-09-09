import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./agreements.page').then((m) => m.AgreementsPage),
    title: 'Agreements · Vexto',
  },
  {
    // `withComponentInputBinding` turns :agreementId into a component input, so the detail page
    // never reads the ActivatedRoute snapshot itself.
    path: ':agreementId',
    loadComponent: () => import('./agreement-detail.page').then((m) => m.AgreementDetailPage),
    title: 'Agreement · Vexto',
  },
];
