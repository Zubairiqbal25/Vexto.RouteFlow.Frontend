import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  ContentSummary,
  CreateEmailTemplateCommand,
  CreateReportTemplateCommand,
  EmailLayout,
  EmailPreview,
  EmailTemplateDetail,
  EmailTemplateSummary,
  EmailTemplateVersion,
  PagedResult,
  ReportPreview,
  ReportTemplateDetail,
  ReportTemplateSummary,
  ReportTemplateVersion,
  SendTestEmailResult,
  TemplateVariable,
  UpdateEmailLayoutCommand,
  UpdateEmailTemplateCommand,
  UpdateReportTemplateCommand,
} from '@vexto/models';
import { type Query, VextoHttp } from './vexto-http';

/**
 * Sample variables for a preview or a test send, keyed by the declared variable name. A value is
 * text, a number, a boolean, or — for a collection variable — an array of flat row objects.
 */
export type TemplateVariableValues = Readonly<Record<string, unknown>>;

/** What to preview: the saved copy, one version, or the editor's unsaved content. */
export interface EmailPreviewRequest {
  readonly variables?: TemplateVariableValues;
  readonly versionNumber?: number | null;
  readonly subjectTemplate?: string | null;
  readonly htmlBodyTemplate?: string | null;
  readonly textBodyTemplate?: string | null;
  readonly variableDefinitions?: readonly TemplateVariable[] | null;
}

export interface ReportPreviewRequest {
  readonly variables?: TemplateVariableValues;
  readonly versionNumber?: number | null;
  readonly contentTemplate?: string | null;
  readonly headerTemplate?: string | null;
  readonly footerTemplate?: string | null;
  readonly cssTemplate?: string | null;
  readonly variableDefinitions?: readonly TemplateVariable[] | null;
}

export interface SendTestEmailRequest {
  readonly email: string;
  readonly variables?: TemplateVariableValues;
  readonly versionNumber?: number | null;
}

/** Search, filters and paging for either template list. A `Query`, so it goes straight to the query string. */
export interface TemplateListQuery extends Query {
  readonly search?: string | null;
  readonly category?: string | null;
  readonly status?: string | null;
  readonly pageNumber?: number;
  readonly pageSize?: number;
}

/**
 * Platform email templates. Every route is ServiceAdmin-only on the server (`Content.View` /
 * `Content.Manage`), and every one is platform-global: there is no tenant in any URL here.
 */
@Injectable({ providedIn: 'root' })
export class EmailTemplatesApi {
  private readonly http = inject(VextoHttp);
  private readonly base = '/api/v1/platform/email-templates';

  list(query: TemplateListQuery): Observable<PagedResult<EmailTemplateSummary>> {
    return this.http.get(this.base, query);
  }

  get(id: string): Observable<EmailTemplateDetail> {
    return this.http.get(`${this.base}/${id}`);
  }

  getByCode(code: string): Observable<EmailTemplateDetail> {
    return this.http.get(`${this.base}/by-code/${encodeURIComponent(code)}`);
  }

  create(command: CreateEmailTemplateCommand): Observable<EmailTemplateDetail> {
    return this.http.post(this.base, command);
  }

  update(id: string, command: UpdateEmailTemplateCommand): Observable<EmailTemplateDetail> {
    return this.http.put(`${this.base}/${id}`, command);
  }

  publish(id: string, notes?: string | null): Observable<EmailTemplateDetail> {
    return this.http.post(`${this.base}/${id}/publish`, { notes: notes ?? null });
  }

  deactivate(id: string): Observable<EmailTemplateDetail> {
    return this.http.post(`${this.base}/${id}/deactivate`);
  }

  activate(id: string): Observable<EmailTemplateDetail> {
    return this.http.post(`${this.base}/${id}/activate`);
  }

  archive(id: string): Observable<EmailTemplateDetail> {
    return this.http.post(`${this.base}/${id}/archive`);
  }

  versions(id: string): Observable<EmailTemplateVersion[]> {
    return this.http.get(`${this.base}/${id}/versions`);
  }

  /** Renders inside the platform layout. Sends nothing. */
  preview(id: string, request: EmailPreviewRequest): Observable<EmailPreview> {
    return this.http.post(`${this.base}/${id}/preview`, request);
  }

  sendTest(id: string, request: SendTestEmailRequest): Observable<SendTestEmailResult> {
    return this.http.post(`${this.base}/${id}/send-test`, request);
  }
}

@Injectable({ providedIn: 'root' })
export class ReportTemplatesApi {
  private readonly http = inject(VextoHttp);
  private readonly base = '/api/v1/platform/report-templates';

  list(query: TemplateListQuery): Observable<PagedResult<ReportTemplateSummary>> {
    return this.http.get(this.base, query);
  }

  get(id: string): Observable<ReportTemplateDetail> {
    return this.http.get(`${this.base}/${id}`);
  }

  create(command: CreateReportTemplateCommand): Observable<ReportTemplateDetail> {
    return this.http.post(this.base, command);
  }

  update(id: string, command: UpdateReportTemplateCommand): Observable<ReportTemplateDetail> {
    return this.http.put(`${this.base}/${id}`, command);
  }

  publish(id: string, notes?: string | null): Observable<ReportTemplateDetail> {
    return this.http.post(`${this.base}/${id}/publish`, { notes: notes ?? null });
  }

  deactivate(id: string): Observable<ReportTemplateDetail> {
    return this.http.post(`${this.base}/${id}/deactivate`);
  }

  activate(id: string): Observable<ReportTemplateDetail> {
    return this.http.post(`${this.base}/${id}/activate`);
  }

  archive(id: string): Observable<ReportTemplateDetail> {
    return this.http.post(`${this.base}/${id}/archive`);
  }

  versions(id: string): Observable<ReportTemplateVersion[]> {
    return this.http.get(`${this.base}/${id}/versions`);
  }

  preview(id: string, request: ReportPreviewRequest): Observable<ReportPreview> {
    return this.http.post(`${this.base}/${id}/preview`, request);
  }
}

/** The CMS dashboard summary and the one platform email layout. */
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(VextoHttp);

  summary(): Observable<ContentSummary> {
    return this.http.get('/api/v1/platform/content/summary');
  }

  layout(): Observable<EmailLayout> {
    return this.http.get('/api/v1/platform/email-layout');
  }

  updateLayout(command: UpdateEmailLayoutCommand): Observable<EmailLayout> {
    return this.http.put('/api/v1/platform/email-layout', command);
  }
}
