import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReportTemplatesApi, VextoApiError } from '@vexto/api-client';
import type { ReportTemplateSummary, ReportTemplateVersion } from '@vexto/models';
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
import { TemplateCard } from '../../shared/template-card';
import { VersionHistory } from '../../shared/version-history';

interface TemplateFilters extends Record<string, unknown> {
  search: string;
  category: string;
  status: string;
}

const CATEGORIES = ['Billing', 'Trips', 'Passengers', 'Drivers', 'Operations', 'System'];
const STATUSES = ['Draft', 'Active', 'Inactive', 'Archived'];

/** Every report template, in the same visual language as the email list — minus test sends. */
@Component({
  selector: 'vexto-report-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PreviewFrame,
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
    <vx-page-header title="Report Templates" description="Generated documents — manifests, invoices, statements — as templates with explicit render models.">
      <a actions class="vx-btn vx-btn-primary" routerLink="/report-templates/new">
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
      <vx-filter-bar toolbar searchPlaceholder="Search code or name" searchLabel="Search report templates" (searchChange)="list.setFilter({ search: $event })">
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
          <span class="hidden text-meta text-ink-muted sm:inline">{{ list.total() }} {{ list.total() === 1 ? 'template' : 'templates' }}</span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        <div class="p-4 sm:p-5"><vx-card-grid><vx-skeleton-card [count]="3" [media]="true" /></vx-card-grid></div>
      </div>

      <vx-error-state error title="We could not load report templates" [message]="list.error() ?? ''" (retry)="list.reload()" />

      <vx-empty-state
        empty
        icon="agreements"
        [title]="list.isFiltered() ? 'No matching templates' : 'No report templates'"
        [description]="list.isFiltered() ? 'Try a different search term or clear the filters.' : 'Create a template for the first document the platform generates.'"
      />

      @if (layout() === 'cards') {
        <vx-card-grid>
          @for (template of list.items(); track template.id) {
            <vexto-template-card [item]="template" icon="agreements" [canSendTest]="false" (opened)="edit(template)" (action)="onAction(template, $event)" />
          }
        </vx-card-grid>
      } @else {
        <table class="vx-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Type</th>
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
                <td>{{ template.templateType }}</td>
                <td><vx-status-badge [status]="template.status" /></td>
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

    <vx-modal [open]="previewing() !== null" [title]="previewing()?.name ?? 'Preview'" [description]="previewing()?.code ?? null" size="lg" (closed)="previewing.set(null)">
      @if (previewHtml(); as html) {
        <vexto-preview-frame [html]="html" [title]="'Preview of ' + (previewing()?.code ?? '')" height="720px" />
      } @else if (previewError(); as message) {
        <vx-error-state title="The template does not render" [message]="message" (retry)="preview(previewing()!)" />
      } @else {
        <div class="vx-skeleton h-96 w-full"></div>
      }
      <button footer type="button" class="vx-btn vx-btn-secondary" (click)="previewing.set(null)">Close</button>
    </vx-modal>

    <vexto-version-history
      [open]="history() !== null"
      [subtitle]="history()?.code ?? null"
      [loading]="historyLoading()"
      [versions]="versions()"
      (closed)="history.set(null)"
      (preview)="previewVersion($event)"
    />
  `,
})
export class ReportTemplatesPage {
  private readonly api = inject(ReportTemplatesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private readonly preference = listViewPreference('cms-report-templates');
  protected readonly layout = this.preference.view;
  protected readonly categories = CATEGORIES;
  protected readonly statuses = STATUSES;
  protected readonly relative = formatRelative;

  protected readonly list = new PagedList<ReportTemplateSummary, TemplateFilters>(
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

  protected readonly previewing = signal<ReportTemplateSummary | null>(null);
  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly history = signal<ReportTemplateSummary | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly versions = signal<ReportTemplateVersion[]>([]);

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected onCategory(event: Event): void {
    this.list.setFilter({ category: (event.target as HTMLSelectElement).value });
  }

  protected onStatus(event: Event): void {
    this.list.setFilter({ status: (event.target as HTMLSelectElement).value });
  }

  protected edit(template: ReportTemplateSummary): void {
    void this.router.navigate(['/report-templates', template.id]);
  }

  protected onAction(template: ReportTemplateSummary, action: string): void {
    const handlers: Record<string, () => void> = {
      edit: () => this.edit(template),
      preview: () => this.preview(template),
      history: () => this.openHistory(template),
      deactivate: () => void this.deactivate(template),
      activate: () => this.activate(template),
    };

    handlers[action]?.();
  }

  protected preview(template: ReportTemplateSummary, versionNumber: number | null = null): void {
    this.previewing.set(template);
    this.previewHtml.set(null);
    this.previewError.set(null);

    this.api.preview(template.id, { versionNumber }).subscribe({
      next: (preview) => this.previewHtml.set(preview.html),
      error: (error: unknown) => this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.'),
    });
  }

  protected previewVersion(versionNumber: number): void {
    const template = this.history();

    if (template) {
      this.preview(template, versionNumber);
    }
  }

  protected openHistory(template: ReportTemplateSummary): void {
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

  protected async deactivate(template: ReportTemplateSummary): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Deactivate ${template.code}?`,
      message: 'Documents rendered from this template will fail until it is reactivated.',
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

  protected activate(template: ReportTemplateSummary): void {
    this.api.activate(template.id).subscribe({
      next: () => {
        this.toast.success(`${template.code} is active.`);
        this.list.refreshQuietly();
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not activate this template.'),
    });
  }
}
