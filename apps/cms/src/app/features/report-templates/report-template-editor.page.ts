import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReportTemplatesApi, VextoApiError } from '@vexto/api-client';
import type { ReportTemplateDetail, ReportTemplateVersion, TemplateVariable } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxErrorState,
  VxField,
  VxFormSection,
  VxIcon,
  VxPageHeader,
  VxStatusBadge,
  VxTabs,
} from '@vexto/ui';
import { formatDateTime } from '@vexto/utilities';
import { Subject, debounceTime } from 'rxjs';
import { CodeEditor } from '../../shared/code-editor';
import { PreviewFrame } from '../../shared/preview-frame';
import { sampleValues, toVariableValues } from '../../shared/sample-values';
import { unsavedChangesGuard } from '../../shared/unsaved-changes';
import { VariableDefinitionsDialog } from '../../shared/variable-definitions-dialog';
import { VariablePanel } from '../../shared/variable-panel';
import { VersionHistory } from '../../shared/version-history';

const CATEGORIES = ['Billing', 'Trips', 'Passengers', 'Drivers', 'Operations', 'System'] as const;
const TYPES = ['Html', 'PdfHtml'] as const;
const CODE = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/u;

type Section = 'content' | 'frame' | 'css' | 'preview';
type Part = 'content' | 'header' | 'footer';

/**
 * The report template editor. Same shape and same rules as the email editor, with four content
 * parts (content, header, footer, stylesheet) instead of three, and no test send — a document is
 * previewed, not delivered.
 *
 * A `PdfHtml` template previews exactly as an `Html` one does: the preview is a print-ready HTML
 * document. There is no PDF engine in the platform yet (docs/content-management.md), so the type
 * records the intent for the day one is added rather than promising a download today.
 */
@Component({
  selector: 'vexto-report-template-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CodeEditor,
    PreviewFrame,
    VariableDefinitionsDialog,
    VariablePanel,
    VersionHistory,
    VxErrorState,
    VxField,
    VxFormSection,
    VxIcon,
    VxPageHeader,
    VxStatusBadge,
    VxTabs,
  ],
  template: `
    @if (loadError(); as message) {
      <vx-error-state title="We could not load this template" [message]="message" (retry)="load()" />
    } @else {
      <vx-page-header
        [title]="isNew() ? 'New report template' : (template()?.code ?? 'Report template')"
        [description]="isNew() ? 'A new document template. It starts as a draft.' : (template()?.name ?? null)"
        [breadcrumbs]="[{ label: 'Report Templates', link: '/report-templates' }]"
      >
        <span actions class="flex flex-wrap items-center gap-2">
          @if (template(); as current) {
            <vx-status-badge [status]="current.status" />
            @if (current.isSystem) {
              <span class="vx-badge vx-tone-info">System</span>
            }
            <span class="text-meta text-ink-muted">{{ current.currentVersion > 0 ? 'v' + current.currentVersion : 'Never published' }}</span>
            <button type="button" class="vx-btn vx-btn-secondary" (click)="openHistory()">
              <vx-icon name="history" [size]="16" />
              History
            </button>
          }
          <button type="button" class="vx-btn vx-btn-secondary" [disabled]="saving() || !form.dirty && !isNew()" (click)="save()">
            {{ saving() ? 'Saving…' : isNew() ? 'Create draft' : 'Save' }}
          </button>
          @if (!isNew()) {
            <button type="button" class="vx-btn vx-btn-primary" [disabled]="saving() || publishing() || form.dirty" (click)="publish()">
              <vx-icon name="check" [size]="16" />
              {{ publishing() ? 'Publishing…' : 'Publish' }}
            </button>
          }
        </span>
      </vx-page-header>

      @if (template()?.hasUnpublishedChanges && (template()?.currentVersion ?? 0) > 0 && !form.dirty) {
        <div class="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body" style="background: var(--vexto-warning-soft); color: var(--vexto-warning-text)" role="status">
          <vx-icon name="alert" [size]="17" />
          <span>The working copy has edits that are not published. Version {{ template()?.currentVersion }} is what renders until you publish.</span>
        </div>
      }
      @if (formError(); as message) {
        <div class="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body" style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)" role="alert">
          <vx-icon name="alert" [size]="17" />
          <span>{{ message }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="flex min-w-0 flex-col gap-6">
          <vx-form-section title="General" description="The code is what a future consumer renders by. The type records whether the document is meant for print.">
            <div class="grid gap-4 sm:grid-cols-2">
              <vx-field label="Code" for="code" [required]="true" [control]="form.controls.code" help="Area.Name in PascalCase, e.g. Trips.PassengerManifest.">
                <input id="code" class="vx-input font-mono" formControlName="code" spellcheck="false" />
              </vx-field>
              <vx-field label="Name" for="name" [required]="true" [control]="form.controls.name">
                <input id="name" class="vx-input" formControlName="name" />
              </vx-field>
              <vx-field label="Category" for="category" [required]="true">
                <select id="category" class="vx-select" formControlName="category">
                  @for (category of categories; track category) {
                    <option [value]="category">{{ category }}</option>
                  }
                </select>
              </vx-field>
              <vx-field label="Type" for="type" [required]="true" help="PdfHtml is a page-sized document with print CSS; Html is for a screen.">
                <select id="type" class="vx-select" formControlName="templateType">
                  @for (type of types; track type) {
                    <option [value]="type">{{ type }}</option>
                  }
                </select>
              </vx-field>
              <vx-field label="Description" for="description" [wide]="true">
                <input id="description" class="vx-input" formControlName="description" />
              </vx-field>
            </div>
          </vx-form-section>

          <div class="vx-card overflow-hidden">
            <div class="border-b border-line-subtle px-4 pt-3">
              <vx-tabs [tabs]="tabs" [active]="section()" label="Editor sections" (selected)="selectSection($event)" />
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'content'">
              <vx-field label="Content" for="content" [required]="true" [control]="form.controls.contentTemplate" help="Loop over a collection with {{ '{{ for row in Rows }}…{{ end }}' }}. Scripts and event handlers are refused on save.">
                <vexto-code-editor #contentEditor inputId="content" label="Content" formControlName="contentTemplate" minHeight="360px" (focusin)="focused.set('content')" />
              </vx-field>
            </div>

            <div class="flex flex-col gap-4 p-4 sm:p-5" [hidden]="section() !== 'frame'">
              <vx-field label="Header" for="header" help="Repeated above the content. Optional.">
                <vexto-code-editor #headerEditor inputId="header" label="Header" formControlName="headerTemplate" minHeight="140px" (focusin)="focused.set('header')" />
              </vx-field>
              <vx-field label="Footer" for="footer" help="Repeated below the content. Optional.">
                <vexto-code-editor #footerEditor inputId="footer" label="Footer" formControlName="footerTemplate" minHeight="140px" (focusin)="focused.set('footer')" />
              </vx-field>
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'css'">
              <vx-field label="Stylesheet" for="css" help="Placed after the platform's print baseline, so it wins. @page rules are honoured by print and by a future PDF converter.">
                <vexto-code-editor inputId="css" label="Stylesheet" formControlName="cssTemplate" minHeight="280px" />
              </vx-field>
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'preview'">
              <div class="mb-3 flex items-center justify-between gap-3">
                <p class="text-meta text-ink-muted">Rendered with the declared sample values as a complete document.</p>
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" [disabled]="previewLoading()" (click)="refreshPreview()">
                  <vx-icon name="refresh" [size]="14" />
                  {{ previewLoading() ? 'Rendering…' : 'Refresh' }}
                </button>
              </div>
              @if (previewError(); as message) {
                <vx-error-state title="The template does not render" [message]="message" (retry)="refreshPreview()" />
              } @else if (previewHtml(); as html) {
                <vexto-preview-frame [html]="html" title="Report preview" height="720px" />
              } @else {
                <div class="vx-skeleton h-96 w-full"></div>
              }
            </div>
          </div>
        </div>

        <aside class="flex flex-col gap-4">
          <vexto-variable-panel [variables]="variables()" (insert)="insertVariable($event)" (manage)="openVariables()" />

          @if (template(); as current) {
            <div class="vx-card flex flex-col gap-2 p-4">
              <h3 class="text-body font-semibold text-ink">Lifecycle</h3>
              <p class="text-meta text-ink-muted">Created {{ when(current.createdAtUtc) }}{{ current.updatedAtUtc ? ' · updated ' + when(current.updatedAtUtc) : '' }}</p>
              @if (current.status === 'Active') {
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm self-start" (click)="deactivate()"><vx-icon name="ban" [size]="14" /> Deactivate</button>
              } @else if (current.status === 'Inactive') {
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm self-start" (click)="activate()"><vx-icon name="check" [size]="14" /> Activate</button>
              }
              @if (!current.isSystem && current.status !== 'Archived') {
                <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm self-start" style="color: var(--vexto-danger-text)" (click)="archive()"><vx-icon name="trash" [size]="14" /> Archive</button>
              }
            </div>
          }
        </aside>
      </form>

      <vexto-variable-definitions-dialog #variablesDialog [open]="variablesOpen()" [variables]="variables()" (closed)="variablesOpen.set(false)" (applied)="applyVariables($event)" />

      @if (template(); as current) {
        <vexto-version-history [open]="historyOpen()" [subtitle]="current.code" [loading]="historyLoading()" [versions]="versions()" (closed)="historyOpen.set(false)" (preview)="previewVersion($event)" />
      }
    }
  `,
})
export class ReportTemplateEditorPage implements OnInit {
  private readonly api = inject(ReportTemplatesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly discardGuard = unsavedChangesGuard();

  readonly id = input<string | undefined>(undefined);

  protected readonly categories = CATEGORIES;
  protected readonly types = TYPES;
  protected readonly tabs = [
    { id: 'content', label: 'Content' },
    { id: 'frame', label: 'Header & footer' },
    { id: 'css', label: 'Stylesheet' },
    { id: 'preview', label: 'Preview' },
  ];
  protected readonly when = formatDateTime;

  protected readonly template = signal<ReportTemplateDetail | null>(null);
  protected readonly variables = signal<TemplateVariable[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly section = signal<Section>('content');
  protected readonly focused = signal<Part>('content');
  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly variablesOpen = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly versions = signal<ReportTemplateVersion[]>([]);
  protected readonly isNew = computed(() => !this.id());

  private readonly contentEditor = viewChild<CodeEditor>('contentEditor');
  private readonly headerEditor = viewChild<CodeEditor>('headerEditor');
  private readonly footerEditor = viewChild<CodeEditor>('footerEditor');
  private readonly variablesDialog = viewChild<VariableDefinitionsDialog>('variablesDialog');
  private readonly previewRequests = new Subject<void>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(CODE)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.maxLength(600)]],
    category: ['Operations', Validators.required],
    templateType: ['Html', Validators.required],
    contentTemplate: ['', Validators.required],
    headerTemplate: [''],
    footerTemplate: [''],
    cssTemplate: [''],
  });

  constructor() {
    this.previewRequests.pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refreshPreview());
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.section() === 'preview') {
        this.previewRequests.next();
      }
    });
  }

  /** Route inputs are bound after construction, so the template is read here rather than in the constructor. */
  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);
    const id = this.id();

    if (!id) {
      this.form.patchValue({ contentTemplate: '<h1>{{ Title }}</h1>\n<table>\n  <thead><tr><th>Name</th></tr></thead>\n  <tbody>\n    {{ for row in Rows }}<tr><td>{{ row.Name }}</td></tr>{{ end }}\n  </tbody>\n</table>' });
      this.variables.set([
        { name: 'Title', description: 'The document heading', required: true, kind: 'Text', sampleValue: 'Sample report' },
        { name: 'Rows', description: 'Rows with a Name', required: true, kind: 'Collection', sampleValue: '[{"Name":"Amina"},{"Name":"Omar"}]' },
      ]);

      return;
    }

    this.api.get(id).subscribe({
      next: (template) => this.apply(template),
      error: (error: unknown) => this.loadError.set(error instanceof VextoApiError ? error.message : 'We could not load this template.'),
    });
  }

  private apply(template: ReportTemplateDetail): void {
    this.template.set(template);
    this.variables.set(template.variables);
    this.form.reset({
      code: template.code,
      name: template.name,
      description: template.description ?? '',
      category: template.category,
      templateType: template.templateType,
      contentTemplate: template.contentTemplate,
      headerTemplate: template.headerTemplate ?? '',
      footerTemplate: template.footerTemplate ?? '',
      cssTemplate: template.cssTemplate ?? '',
    });

    if (template.isSystem || template.status === 'Archived') {
      this.form.controls.code.disable();
    }

    if (template.status === 'Archived') {
      this.form.disable();
    }
  }

  protected selectSection(id: string): void {
    this.section.set(id as Section);

    if (id === 'preview' && !this.previewHtml()) {
      this.refreshPreview();
    }
  }

  protected refreshPreview(): void {
    const id = this.id();

    if (!id) {
      this.previewError.set('Create the draft first, then preview it.');

      return;
    }

    const raw = this.form.getRawValue();
    this.previewLoading.set(true);
    this.previewError.set(null);

    this.api
      .preview(id, {
        contentTemplate: raw.contentTemplate,
        headerTemplate: raw.headerTemplate,
        footerTemplate: raw.footerTemplate,
        cssTemplate: raw.cssTemplate,
        variableDefinitions: this.variables(),
        variables: toVariableValues(this.variables(), sampleValues(this.variables())),
      })
      .subscribe({
        next: (preview) => {
          this.previewLoading.set(false);
          this.previewHtml.set(preview.html);
        },
        error: (error: unknown) => {
          this.previewLoading.set(false);
          this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.');
        },
      });
  }

  protected previewVersion(versionNumber: number): void {
    const id = this.id();

    if (!id) {
      return;
    }

    this.historyOpen.set(false);
    this.section.set('preview');
    this.previewLoading.set(true);
    this.previewError.set(null);

    this.api.preview(id, { versionNumber }).subscribe({
      next: (preview) => {
        this.previewLoading.set(false);
        this.previewHtml.set(preview.html);
      },
      error: (error: unknown) => {
        this.previewLoading.set(false);
        this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.');
      },
    });
  }

  protected insertVariable(name: string): void {
    const token = `{{ ${name} }}`;
    const editors: Record<Part, () => CodeEditor | undefined> = {
      content: () => this.contentEditor(),
      header: () => this.headerEditor(),
      footer: () => this.footerEditor(),
    };

    this.section.set(this.focused() === 'content' ? 'content' : 'frame');
    editors[this.focused()]()?.insertAtCaret(token);
    this.form.markAsDirty();
  }

  protected openVariables(): void {
    this.variablesDialog()?.reset();
    this.variablesOpen.set(true);
  }

  protected applyVariables(variables: TemplateVariable[]): void {
    this.variables.set(variables);
    this.variablesOpen.set(false);
    this.form.markAsDirty();
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Fill in the highlighted fields first.');

      return;
    }

    const raw = this.form.getRawValue();
    const content = {
      code: raw.code.trim(),
      name: raw.name.trim(),
      description: raw.description.trim() || null,
      category: raw.category as ReportTemplateDetail['category'],
      templateType: raw.templateType as ReportTemplateDetail['templateType'],
      contentTemplate: raw.contentTemplate,
      headerTemplate: raw.headerTemplate || null,
      footerTemplate: raw.footerTemplate || null,
      cssTemplate: raw.cssTemplate || null,
      variables: this.variables(),
    };

    this.saving.set(true);
    this.formError.set(null);

    const request = this.isNew() ? this.api.create({ ...content, language: 'en' }) : this.api.update(this.id()!, content);

    request.subscribe({
      next: (template) => {
        this.saving.set(false);

        if (this.isNew()) {
          this.toast.success(`${template.code} created as a draft.`);
          void this.router.navigate(['/report-templates', template.id]);

          return;
        }

        this.apply(template);
        this.previewHtml.set(null);
        this.toast.success('Working copy saved. Publish to make it live.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(error instanceof VextoApiError && error.kind !== 'unknown' ? error.message : 'We could not save the template.');
      },
    });
  }

  protected async publish(): Promise<void> {
    const current = this.template();

    if (!current || this.publishing()) {
      return;
    }

    const next = current.currentVersion + 1;
    const confirmed = await this.confirm.ask({
      title: `Publish ${current.code} as version ${next}?`,
      message: 'The working copy becomes the version documents are rendered from. The previous version stays in the history.',
      confirmLabel: `Publish v${next}`,
    });

    if (!confirmed) {
      return;
    }

    this.publishing.set(true);
    this.formError.set(null);

    this.api.publish(current.id).subscribe({
      next: (template) => {
        this.publishing.set(false);
        this.apply(template);
        this.toast.success(`${template.code} v${template.currentVersion} is live.`);
      },
      error: (error: unknown) => {
        this.publishing.set(false);
        this.formError.set(error instanceof VextoApiError && error.kind !== 'unknown' ? error.message : 'We could not publish the template.');
      },
    });
  }

  protected openHistory(): void {
    const id = this.id();

    if (!id) {
      return;
    }

    this.historyOpen.set(true);
    this.historyLoading.set(true);

    this.api.versions(id).subscribe({
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

  protected async deactivate(): Promise<void> {
    const current = this.template();

    if (!current) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: `Deactivate ${current.code}?`,
      message: 'Documents rendered from this template will fail until it is reactivated.',
      confirmLabel: 'Deactivate',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.deactivate(current.id).subscribe({
      next: (template) => {
        this.apply(template);
        this.toast.success(`${template.code} deactivated.`);
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not deactivate this template.'),
    });
  }

  protected activate(): void {
    const current = this.template();

    if (!current) {
      return;
    }

    this.api.activate(current.id).subscribe({
      next: (template) => {
        this.apply(template);
        this.toast.success(`${template.code} is active.`);
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not activate this template.'),
    });
  }

  protected async archive(): Promise<void> {
    const current = this.template();

    if (!current) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: `Archive ${current.code}?`,
      message: 'The template leaves the working list and can no longer be edited or published. Its version history is kept.',
      confirmLabel: 'Archive',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.archive(current.id).subscribe({
      next: () => {
        this.toast.success(`${current.code} archived.`);
        void this.router.navigate(['/report-templates']);
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not archive this template.'),
    });
  }

  canLeave(): Promise<boolean> {
    return this.discardGuard(this.form);
  }
}
