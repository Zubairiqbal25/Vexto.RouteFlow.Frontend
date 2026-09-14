import type { Routes } from '@angular/router';
import { tenantsGuard } from '../../tenants.guard';

/**
 * Tenant management: the list, the onboarding wizard and the per-tenant control centre.
 *
 * Guarded on `Tenants.View` in addition to the CMS guard, so the day a second platform role is
 * granted content permissions without tenant permissions, this area stays closed to it.
 */
export const routes: Routes = [
  {
    path: '',
    canActivate: [tenantsGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./tenants.page').then((m) => m.CmsTenantsPage),
        title: 'Tenants · Vexto CMS',
      },
      {
        path: 'new',
        loadComponent: () => import('./tenant-wizard.page').then((m) => m.CmsTenantWizardPage),
        title: 'Create tenant · Vexto CMS',
      },
      {
        path: ':tenantId',
        loadComponent: () => import('./tenant-detail.page').then((m) => m.CmsTenantDetailPage),
        title: 'Tenant · Vexto CMS',
      },
    ],
  },
];
