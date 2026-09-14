import type { Routes } from '@angular/router';
import type { ReportTemplateEditorPage } from './report-template-editor.page';

const confirmLeave = (page: ReportTemplateEditorPage) => page.canLeave();

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./report-templates.page').then((m) => m.ReportTemplatesPage),
    title: 'Report templates · Vexto CMS',
  },
  {
    path: 'new',
    loadComponent: () => import('./report-template-editor.page').then((m) => m.ReportTemplateEditorPage),
    canDeactivate: [confirmLeave],
    title: 'New report template · Vexto CMS',
  },
  {
    path: ':id',
    loadComponent: () => import('./report-template-editor.page').then((m) => m.ReportTemplateEditorPage),
    canDeactivate: [confirmLeave],
    title: 'Report template · Vexto CMS',
  },
];
