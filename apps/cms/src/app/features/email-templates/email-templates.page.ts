import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EmailTemplatesApi, VextoApiError } from '@vexto/api-client';
import type { EmailTemplateSummary, EmailTemplateVersion, TemplateVariable } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxCardGrid,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxModal,
  VxPageHeader,
  VxSkeletonCard,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { PreviewFrame } from '../../shared/preview-frame';
import { SendTestDialog } from '../../shared/send-test-dialog';
import { TemplateCard } from '../../shared/template-card';
import { VersionHistory } from '../../shared/version-history';

interface TemplateFilters extends Record<string, unknown> {
  search: string;
  category: string;
  status: string;
}

const CATEGORIES = ['Authentication', 'Account', 'Trip', 'Passenger', 'Driver', 'Billing', 'Payment', 'Notification', 'System'];
const STATUSES = ['Draft', 'Active', 'Inactive', 'Archived'];

/**
 * Every platform email template, as cards or a table.
 *
 * Preview, test send and history open in place so that checking what `Auth.EmailOtp` looks like
 * today is one click from the list; editing goes to the editor page, which is where the working
 * copy lives.
 */
@Component({
  selector: 'vexto-email-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PreviewFrame,
    SendTestDialog,
    TemplateCard,
    VersionHistory,
    VxCardGrid,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxModal,
    VxPageHeader,
    VxSkeletonCard,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
  ],
  template: `
    <vx-page-header title="Email Templates" description="Every email the platform sends, by stable code. Application code supplies the variables; the template decides the words.">
      <a actions class="vx-btn vx-btn-primary" routerLink="/email-templates/new">
        <vx-icon name="plus" [size]="16" />
        New Template
      </a>
    </vx-page-header>

    <vx-table-shell
      [layout]="layout()"
      [loading]="list.loading()"
      [error]="list.error()"
      [isEmpty]="list.isEmpty()"
      [page]="list.page()"
      [pageSize]="list.pageSize"
      [totalCount]="list.total()"
      (pageChange)="list.setPage($event)"
    >
      <vx-filter-bar
        toolbar
        searchPlaceholder="Search code, name or subject"
        searchLabel="Search email templates"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select filters class="vx-select w-auto" aria-label="Filter by category" (change)="onCategory($event)">
          <option value="">All categories</option>
          @for (category of categories; track category) {
            <option [value]="category">{{ category }}</option>
          }
        </select>
        <select filters class="vx-select w-auto" aria-label="Filter by status" (change)="onStatus($event)">
          <option value="">Active, draft & inactive</option>
          @for (status of statuses; track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'template' : 'templates' }}
          </span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid><vx-skeleton-card [count]="6" [media]="true" /></vx-card-grid>
          </div>
        } @else {
          <div class="p-5"><div class="vx-skeleton h-64 w-full"></div></div>
        }
      </div>

      <vx-error-state error title="We could not load email templates" [message]="list.error() ?? ''" (retry)="list.reload()" />

      <vx-empty-state
        empty
        icon="mail"
        [title]="list.isFiltered() ? 'No matching templates' : 'No email templates'"
        [description]="list.isFiltered() ? 'Try a different search term or clear the filters.' : 'System templates are seeded on first start. Create one to add a new email.'"
      />

      @if (layout() === 'cards') {
        <vx-card-grid>
          @for (template of list.items(); track template.id) {
            <vexto-template-card
              [item]="template"
              icon="mail"
              (opened)="edit(template)"
              (action)="onAction(template, $event)"
            />
          }
        </vx-card-grid>
      } @else {
        <table class="vx-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Status</th>
              <th scope="col">Version</th>
              <th scope="col">Updated</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (template of list.items(); track template.id) {
              <tr>
                <td class="vx-cell-strong font-mono">{{ template.code }}</td>
                <td>{{ template.name }}</td>
                <td>{{ template.category }}</td>
                <td>
                  <span class="flex items-center gap-2">
                    <vx-status-badge [status]="template.status" />
                    @if (template.hasUnpublishedChanges && template.currentVersion > 0) {
                      <span class="vx-badge vx-tone-warning">Edits</span>
                    }
                  </span>
                </td>
                <td>{{ template.currentVersion > 0 ? 'v' + template.currentVersion : '—' }}</td>
                <td>{{ relative(template.updatedAtUtc ?? template.createdAtUtc) }}</td>
                <td class="text-end">
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="preview(template)">Preview</button>
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="edit(template)">Edit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </vx-table-shell>

    <vx-modal
      [open]="previewing() !== null"
      [title]="previewing()?.name ?? 'Preview'"
      [description]="previewSubject()"
      size="lg"
      (closed)="previewing.set(null)"
    >
      @if (previewHtml(); as html) {
        <vexto-preview-frame [html]="html" [title]="'Preview of ' + (previewing()?.code ?? '')" />
      } @else if (previewError(); as message) {
        <vx-error-state title="The template does not render" [message]="message" (retry)="preview(previewing()!)" />
      } @else {
        <div class="vx-skeleton h-96 w-full"></div>
      }
      <button footer type="button" class="vx-btn vx-btn-secondary" (click)="previewing.set(null)">Close</button>
    </vx-modal>

    @if (testing(); as template) {
      <vexto-send-test-dialog
        #sendTest
        [open]="true"
        [templateId]="template.id"
        [variables]="testVariables()"
        (closed)="testing.set(null)"
      />
    }

    <vexto-version-history
      [open]="history() !== null"
      [subtitle]="history()?.code ?? null"
      [loading]="historyLoading()"
      [versions]="versions()"
      [canSendTest]="true"
      (closed)="history.set(null)"
      (preview)="previewVersion($event)"
      (sendTest)="onHistorySendTest($event)"
    />
  `,
})
export class EmailTemplatesPage {
  private readonly api = inject(EmailTemplatesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private readonly preference = listViewPreference('cms-email-templates');
  protected readonly layout = this.preference.view;
  protected readonly categories = CATEGORIES;
  protected readonly statuses = STATUSES;
  protected readonly relative = formatRelative;

  protected readonly list = new PagedList<EmailTemplateSummary, TemplateFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        category: filters.category || undefined,
        status: filters.status || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', category: '', status: '' },
  );

  protected readonly previewing = signal<EmailTemplateSummary | null>(null);
  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewSubject = signal<string | null>(null);
  protected readonly previewError = signal<string | null>(null);

  protected readonly testing = signal<EmailTemplateSummary | null>(null);
  protected readonly testVariables = signal<TemplateVariable[]>([]);
  private readonly sendTest = viewChild<SendTestDialog>('sendTest');

  protected readonly history = signal<EmailTemplateSummary | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly versions = signal<EmailTemplateVersion[]>([]);

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected onCategory(event: Event): void {
    this.list.setFilter({ category: (event.target as HTMLSelectElement).value });
  }

  protected onStatus(event: Event): void {
    this.list.setFilter({ status: (event.target as HTMLSelectElement).value });
  }

  protected edit(template: EmailTemplateSummary): void {
    void this.router.navigate(['/email-templates', template.id]);
  }

  protected onAction(template: EmailTemplateSummary, action: string): void {
    const handlers: Record<string, () => void> = {
      edit: () => this.edit(template),
      preview: () => this.preview(template),
      'send-test': () => this.openSendTest(template),
      history: () => this.openHistory(template),
      deactivate: () => void this.deactivate(template),
      activate: () => this.activate(template),
    };

    handlers[action]?.();
  }

  protected preview(template: EmailTemplateSummary, versionNumber: number | null = null): void {
    this.previewing.set(template);
    this.previewHtml.set(null);
    this.previewError.set(null);
    this.previewSubject.set(null);

    this.api.preview(template.id, { versionNumber }).subscribe({
      next: (preview) => {
        this.previewHtml.set(preview.html);
        this.previewSubject.set(`Subject: ${preview.subject}${versionNumber ? ` · version ${versionNumber}` : ''}`);
      },
      error: (error: unknown) =>
        this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.'),
    });
  }

  protected previewVersion(versionNumber: number): void {
    const template = this.history();

    if (template) {
      this.preview(template, versionNumber);
    }
  }

  protected openSendTest(template: EmailTemplateSummary): void {
    // The list row carries no variables; the detail does.
    this.api.get(template.id).subscribe({
      next: (detail) => {
        this.testVariables.set(detail.variables);
        this.testing.set(template);
        setTimeout(() => this.sendTest()?.reset(), 0);
      },
      error: () => this.toast.error('We could not load the template.'),
    });
  }

  protected onHistorySendTest(versionNumber: number): void {
    const template = this.history();

    if (!template) {
      return;
    }

    void this.router.navigate(['/email-templates', template.id], { queryParams: { sendTest: versionNumber } });
  }

  protected openHistory(template: EmailTemplateSummary): void {
    this.history.set(template);
    this.historyLoading.set(true);
    this.versions.set([]);

    this.api.versions(template.id).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.toast.error('We could not load the version history.');
      },
    });
  }

  protected async deactivate(template: EmailTemplateSummary): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Deactivate ${template.code}?`,
      message: template.isSystem
        ? 'This is a system template. While it is inactive the workflow that sends it will fail visibly — for Auth.EmailOtp, nobody can sign in. Reactivate it to resume.'
        : 'Production sends of this template will fail until it is reactivated.',
      confirmLabel: 'Deactivate',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.deactivate(template.id).subscribe({
      next: () => {
        this.toast.success(`${template.code} deactivated.`);
        this.list.refreshQuietly();
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not deactivate this template.'),
    });
  }

  protected activate(template: EmailTemplateSummary): void {
    this.api.activate(template.id).subscribe({
      next: () => {
        this.toast.success(`${template.code} is active.`);
        this.list.refreshQuietly();
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not activate this template.'),
    });
  }
}
