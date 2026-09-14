import { Component } from '@angular/core';
import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from '@vexto/auth';
import { VxAdminShell, VxAuthShell, VxLoginPage } from '@vexto/layouts';
import { cmsGuard } from './cms.guard';
import { CMS_NAV } from './navigation';

/** Binds the CMS navigation to the shared admin shell. */
@Component({
  selector: 'vexto-cms-shell',
  imports: [VxAdminShell],
  template: '<vx-admin-shell [sections]="sections" [tenantSelector]="false" [notifications]="false" [settingsLink]="null" />',
})
export class CmsShell {
  protected readonly sections = CMS_NAV;
}

/**
 * Two shells, one router, as the operator portal has.
 *
 * The signed-in half is guarded twice: `authGuard` for a session, `cmsGuard` for the content
 * permission. The access-denied page sits outside the second guard so that the person it is for
 * can actually reach it.
 */
export const routes: Routes = [
  {
    path: '',
    component: VxAuthShell,
    canActivate: [anonymousGuard],
    data: { home: '/dashboard' },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        component: VxLoginPage,
        data: {
          home: '/dashboard',
          subtitle: 'Vexto CMS is for platform staff. Enter your email and we will send a sign-in code.',
          footnote: 'Only Vexto platform administrators can manage content. Operator accounts sign in to the operator portal.',
        },
        title: 'Sign in · Vexto CMS',
      },
    ],
  },
  {
    path: '',
    component: CmsShell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'access-denied',
        loadComponent: () =>
          import('./features/shell/access-denied.page').then((m) => m.CmsAccessDeniedPage),
        title: 'Access denied · Vexto CMS',
      },
      {
        path: '',
        canActivate: [cmsGuard],
        children: [
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/dashboard/dashboard.page').then((m) => m.CmsDashboardPage),
            title: 'Dashboard · Vexto CMS',
          },
          {
            path: 'tenants',
            loadChildren: () => import('./features/tenants/tenants.routes').then((m) => m.routes),
          },
          {
            path: 'email-templates',
            loadChildren: () =>
              import('./features/email-templates/email-templates.routes').then((m) => m.routes),
          },
          {
            path: 'report-templates',
            loadChildren: () =>
              import('./features/report-templates/report-templates.routes').then((m) => m.routes),
          },
          {
            path: 'email-layout',
            loadComponent: () =>
              import('./features/layout/email-layout.page').then((m) => m.EmailLayoutPage),
            title: 'Email layout · Vexto CMS',
          },
          {
            path: 'variables',
            loadComponent: () =>
              import('./features/variables/variables.page').then((m) => m.VariablesReferencePage),
            title: 'Template variables · Vexto CMS',
          },
        ],
      },
      {
        path: '**',
        loadComponent: () => import('./features/shell/not-found.page').then((m) => m.CmsNotFoundPage),
        title: 'Not found · Vexto CMS',
      },
    ],
  },
];
