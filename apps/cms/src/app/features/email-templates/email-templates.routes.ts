import type { Routes } from '@angular/router';
import type { EmailTemplateEditorPage } from './email-template-editor.page';

const confirmLeave = (page: EmailTemplateEditorPage) => page.canLeave();

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./email-templates.page').then((m) => m.EmailTemplatesPage),
    title: 'Email templates · Vexto CMS',
  },
  {
    path: 'new',
    loadComponent: () => import('./email-template-editor.page').then((m) => m.EmailTemplateEditorPage),
    canDeactivate: [confirmLeave],
    title: 'New email template · Vexto CMS',
  },
  {
    path: ':id',
    loadComponent: () => import('./email-template-editor.page').then((m) => m.EmailTemplateEditorPage),
    canDeactivate: [confirmLeave],
    title: 'Email template · Vexto CMS',
  },
];
