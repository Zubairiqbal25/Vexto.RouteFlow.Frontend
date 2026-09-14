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
import { ActivatedRoute, Router } from '@angular/router';
import { EmailTemplatesApi, VextoApiError } from '@vexto/api-client';
import type { EmailTemplateDetail, EmailTemplateVersion, TemplateVariable } from '@vexto/models';
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
import { SendTestDialog } from '../../shared/send-test-dialog';
import { unsavedChangesGuard } from '../../shared/unsaved-changes';
import { VariableDefinitionsDialog } from '../../shared/variable-definitions-dialog';
import { VariablePanel } from '../../shared/variable-panel';
import { VersionHistory } from '../../shared/version-history';

const CATEGORIES = ['Authentication', 'Account', 'Trip', 'Passenger', 'Driver', 'Billing', 'Payment', 'Notification', 'System'] as const;
const CODE = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/u;

type Section = 'content' | 'text' | 'preview';

/**
 * The email template editor: general details, subject, HTML body, text body, variables, preview.
 *
 * **Save and Publish are different buttons on purpose.** Save writes the working copy and changes
 * nothing anybody receives; Publish snapshots it as the next version and makes it live. The header
 * says which state the template is in at all times, because the one mistake this screen must
 * prevent is an administrator believing a saved edit has gone out.
 *
 * **The preview is the server's.** It is rendered by the same code, inside the same layout, with
 * the same encoding as a real send — so what the frame shows is what a passenger gets. It refreshes
 * when the preview tab is opened and, while it is open, a second after typing stops; never on every
 * keystroke.
 */
@Component({
  selector: 'vexto-email-template-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CodeEditor,
    PreviewFrame,
    SendTestDialog,
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
        [title]="isNew() ? 'New email template' : (template()?.code ?? 'Email template')"
        [description]="isNew() ? 'A new platform email. It starts as a draft and sends nothing until it is published.' : (template()?.name ?? null)"
        [breadcrumbs]="[{ label: 'Email Templates', link: '/email-templates' }]"
      >
        <span actions class="flex flex-wrap items-center gap-2">
          @if (template(); as current) {
            <vx-status-badge [status]="current.status" />
            @if (current.isSystem) {
              <span class="vx-badge vx-tone-info">System</span>
            }
            <span class="text-meta text-ink-muted">
              {{ current.currentVersion > 0 ? 'v' + current.currentVersion + ' published ' + when(current.publishedAtUtc) : 'Never published' }}
            </span>
            <button type="button" class="vx-btn vx-btn-secondary" (click)="openHistory()">
              <vx-icon name="history" [size]="16" />
              History
            </button>
            <button type="button" class="vx-btn vx-btn-secondary" (click)="openSendTest(null)" [disabled]="form.dirty">
              <vx-icon name="send" [size]="16" />
              Send Test
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
          <span>The working copy has edits that are not published. Passengers still receive version {{ template()?.currentVersion }} until you publish.</span>
        </div>
      }
      @if (form.dirty) {
        <div class="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body bg-surface-muted text-ink-muted" role="status">
          <vx-icon name="info" [size]="17" />
          <span>Unsaved changes. Save the working copy first; publishing and test sends use what is saved.</span>
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
          <vx-form-section title="General" description="The code is the contract application code sends by. Everything else is for people.">
            <div class="grid gap-4 sm:grid-cols-2">
              <vx-field label="Code" for="code" [required]="true" [control]="form.controls.code" help="Area.Name in PascalCase, e.g. Auth.EmailOtp.">
                <input id="code" class="vx-input font-mono" formControlName="code" spellcheck="false" [attr.aria-invalid]="form.controls.code.touched && form.controls.code.invalid" />
              </vx-field>
              <vx-field label="Name" for="name" [required]="true" [control]="form.controls.name">
                <input id="name" class="vx-input" formControlName="name" />
              </vx-field>
              <vx-field label="Category" for="category" [required]="true" [control]="form.controls.category">
                <select id="category" class="vx-select" formControlName="category">
                  @for (category of categories; track category) {
                    <option [value]="category">{{ category }}</option>
                  }
                </select>
              </vx-field>
              <vx-field label="Language" for="language" help="Only English is in use today. A second language becomes a second template with the same code.">
                <input id="language" class="vx-input" formControlName="language" />
              </vx-field>
              <vx-field label="Description" for="description" [wide]="true" [control]="form.controls.description">
                <input id="description" class="vx-input" formControlName="description" />
              </vx-field>
            </div>
          </vx-form-section>

          <vx-form-section title="Subject" description="Variables work here too.">
            <vx-field label="Subject" for="subject" [required]="true" [control]="form.controls.subjectTemplate">
              <input id="subject" class="vx-input" formControlName="subjectTemplate" (focus)="focused.set('subject')" />
            </vx-field>
          </vx-form-section>

          <div class="vx-card overflow-hidden">
            <div class="border-b border-line-subtle px-4 pt-3">
              <vx-tabs [tabs]="tabs" [active]="section()" label="Editor sections" (selected)="selectSection($event)" />
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'content'">
              <vx-field label="HTML body" for="html" [required]="true" [control]="form.controls.htmlBodyTemplate" help="Rendered inside the platform layout. Inline styles; no scripts, event handlers or javascript: links — they are refused on save.">
                <vexto-code-editor #htmlEditor inputId="html" label="HTML body" formControlName="htmlBodyTemplate" minHeight="360px" [invalid]="form.controls.htmlBodyTemplate.touched && form.controls.htmlBodyTemplate.invalid" (focusin)="focused.set('html')" />
              </vx-field>
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'text'">
              <vx-field label="Plain-text body" for="text" [required]="true" [control]="form.controls.textBodyTemplate" help="What a client that cannot show HTML displays, and what spam filters read. Keep it complete.">
                <vexto-code-editor #textEditor inputId="text" label="Plain-text body" formControlName="textBodyTemplate" minHeight="280px" [invalid]="form.controls.textBodyTemplate.touched && form.controls.textBodyTemplate.invalid" (focusin)="focused.set('text')" />
              </vx-field>
            </div>

            <div class="p-4 sm:p-5" [hidden]="section() !== 'preview'">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p class="text-meta text-ink-muted">
                  @if (previewSubject(); as subject) {
                    Subject: <span class="font-medium text-ink">{{ subject }}</span>
                  } @else {
                    Rendered with the declared sample values, inside the platform layout.
                  }
                </p>
                <div class="flex items-center gap-2">
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" [class.vx-btn-secondary]="previewMode() === 'html'" (click)="previewMode.set('html')">HTML</button>
                  <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" [class.vx-btn-secondary]="previewMode() === 'text'" (click)="previewMode.set('text')">Text</button>
                  <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" [disabled]="previewLoading()" (click)="refreshPreview()">
                    <vx-icon name="refresh" [size]="14" />
                    {{ previewLoading() ? 'Rendering…' : 'Refresh' }}
                  </button>
                </div>
              </div>
              @if (previewError(); as message) {
                <vx-error-state title="The template does not render" [message]="message" (retry)="refreshPreview()" />
              } @else if (previewMode() === 'text') {
                <pre class="vx-card overflow-x-auto whitespace-pre-wrap p-4 font-mono text-[13px] text-ink">{{ previewText() ?? 'Rendering…' }}</pre>
              } @else if (previewHtml(); as html) {
                <vexto-preview-frame [html]="html" title="Email preview" />
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
              <p class="text-meta text-ink-muted">
                Created {{ when(current.createdAtUtc) }}{{ current.updatedAtUtc ? ' · updated ' + when(current.updatedAtUtc) : '' }}
              </p>
              @if (current.status === 'Active') {
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm self-start" (click)="deactivate()">
                  <vx-icon name="ban" [size]="14" />
                  Deactivate
                </button>
              } @else if (current.status === 'Inactive') {
                <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm self-start" (click)="activate()">
                  <vx-icon name="check" [size]="14" />
                  Activate
                </button>
              }
              @if (!current.isSystem && current.status !== 'Archived') {
                <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm self-start" style="color: var(--vexto-danger-text)" (click)="archive()">
                  <vx-icon name="trash" [size]="14" />
                  Archive
                </button>
              }
              @if (current.isSystem) {
                <p class="text-meta text-ink-muted">A system template: application code sends by this code, so it cannot be renamed or archived. Its content is yours to change.</p>
              }
            </div>
          }
        </aside>
      </form>

      <vexto-variable-definitions-dialog
        #variablesDialog
        [open]="variablesOpen()"
        [variables]="variables()"
        (closed)="variablesOpen.set(false)"
        (applied)="applyVariables($event)"
      />

      @if (template(); as current) {
        <vexto-send-test-dialog
          #sendTest
          [open]="sendTestOpen()"
          [templateId]="current.id"
          [variables]="current.variables"
          [versionNumber]="sendTestVersion()"
          (closed)="sendTestOpen.set(false)"
        />

        <vexto-version-history
          [open]="historyOpen()"
          [subtitle]="current.code"
          [loading]="historyLoading()"
          [versions]="versions()"
          [canSendTest]="true"
          (closed)="historyOpen.set(false)"
          (preview)="previewVersion($event)"
          (sendTest)="openSendTest($event)"
        />
      }
    }
  `,
})
export class EmailTemplateEditorPage implements OnInit {
  private readonly api = inject(EmailTemplatesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly discardGuard = unsavedChangesGuard();

  /** Bound from the route by withComponentInputBinding; undefined on /new. */
  readonly id = input<string | undefined>(undefined);

  protected readonly categories = CATEGORIES;
  protected readonly tabs = [
    { id: 'content', label: 'HTML body' },
    { id: 'text', label: 'Plain text' },
    { id: 'preview', label: 'Preview' },
  ];
  protected readonly when = formatDateTime;

  protected readonly template = signal<EmailTemplateDetail | null>(null);
  protected readonly variables = signal<TemplateVariable[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly section = signal<Section>('content');
  protected readonly focused = signal<'subject' | 'html' | 'text'>('html');

  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewText = signal<string | null>(null);
  protected readonly previewSubject = signal<string | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewMode = signal<'html' | 'text'>('html');

  protected readonly variablesOpen = signal(false);
  protected readonly sendTestOpen = signal(false);
  protected readonly sendTestVersion = signal<number | null>(null);
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly versions = signal<EmailTemplateVersion[]>([]);

  protected readonly isNew = computed(() => !this.id());

  private readonly htmlEditor = viewChild<CodeEditor>('htmlEditor');
  private readonly textEditor = viewChild<CodeEditor>('textEditor');
  private readonly variablesDialog = viewChild<VariableDefinitionsDialog>('variablesDialog');
  private readonly sendTest = viewChild<SendTestDialog>('sendTest');

  private readonly previewRequests = new Subject<void>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(CODE)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.maxLength(600)]],
    category: ['Notification', Validators.required],
    language: ['en'],
    subjectTemplate: ['', [Validators.required, Validators.maxLength(400)]],
    htmlBodyTemplate: ['', Validators.required],
    textBodyTemplate: ['', Validators.required],
  });

  constructor() {
    // Debounced: the preview tab re-renders a second after typing stops, never per keystroke.
    this.previewRequests
      .pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshPreview());

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
      this.form.controls.language.disable();
      this.form.patchValue({
        htmlBodyTemplate: '<p style="margin:0 0 12px;">Hello {{ FirstName }},</p>\n<p style="margin:0;">…</p>',
        textBodyTemplate: 'Hello {{ FirstName }},\n\n…',
      });
      this.variables.set([{ name: 'FirstName', description: "The recipient's first name", required: true, kind: 'Text', sampleValue: 'Amina' }]);

      return;
    }

    this.api.get(id).subscribe({
      next: (template) => this.apply(template),
      error: (error: unknown) =>
        this.loadError.set(error instanceof VextoApiError ? error.message : 'We could not load this template.'),
    });

    // Arriving from the list's history drawer with a version to test.
    const version = Number(this.route.snapshot.queryParamMap.get('sendTest'));

    if (version > 0) {
      setTimeout(() => this.openSendTest(version), 300);
    }
  }

  private apply(template: EmailTemplateDetail): void {
    this.template.set(template);
    this.variables.set(template.variables);
    this.form.reset({
      code: template.code,
      name: template.name,
      description: template.description ?? '',
      category: template.category,
      language: template.language,
      subjectTemplate: template.subjectTemplate,
      htmlBodyTemplate: template.htmlBodyTemplate,
      textBodyTemplate: template.textBodyTemplate,
    });
    this.form.controls.language.disable();

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
        subjectTemplate: raw.subjectTemplate,
        htmlBodyTemplate: raw.htmlBodyTemplate,
        textBodyTemplate: raw.textBodyTemplate,
        variableDefinitions: this.variables(),
        variables: toVariableValues(this.variables(), sampleValues(this.variables())),
      })
      .subscribe({
        next: (preview) => {
          this.previewLoading.set(false);
          this.previewHtml.set(preview.html);
          this.previewText.set(preview.text);
          this.previewSubject.set(preview.subject);
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
        this.previewText.set(preview.text);
        this.previewSubject.set(`${preview.subject} (version ${versionNumber})`);
      },
      error: (error: unknown) => {
        this.previewLoading.set(false);
        this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.');
      },
    });
  }

  protected insertVariable(name: string): void {
    const token = `{{ ${name} }}`;

    switch (this.focused()) {
      case 'subject': {
        const control = this.form.controls.subjectTemplate;
        control.setValue(`${control.value}${token}`);
        control.markAsDirty();
        break;
      }
      case 'text':
        this.textEditor()?.insertAtCaret(token);
        this.form.controls.textBodyTemplate.markAsDirty();
        break;
      default:
        this.section.set('content');
        this.htmlEditor()?.insertAtCaret(token);
        this.form.controls.htmlBodyTemplate.markAsDirty();
    }
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
    this.saving.set(true);
    this.formError.set(null);

    const request = this.isNew()
      ? this.api.create({
          code: raw.code.trim(),
          name: raw.name.trim(),
          description: raw.description.trim() || null,
          category: raw.category as EmailTemplateDetail['category'],
          language: raw.language || 'en',
          subjectTemplate: raw.subjectTemplate,
          htmlBodyTemplate: raw.htmlBodyTemplate,
          textBodyTemplate: raw.textBodyTemplate,
          variables: this.variables(),
        })
      : this.api.update(this.id()!, {
          code: raw.code.trim(),
          name: raw.name.trim(),
          description: raw.description.trim() || null,
          category: raw.category as EmailTemplateDetail['category'],
          subjectTemplate: raw.subjectTemplate,
          htmlBodyTemplate: raw.htmlBodyTemplate,
          textBodyTemplate: raw.textBodyTemplate,
          variables: this.variables(),
        });

    request.subscribe({
      next: (template) => {
        this.saving.set(false);

        if (this.isNew()) {
          this.toast.success(`${template.code} created as a draft.`);
          void this.router.navigate(['/email-templates', template.id]);

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
      message: current.isSystem
        ? `The next ${current.code} email the platform sends will use this content. No deployment is needed, and the previous version stays in the history.`
        : 'The working copy becomes the version production renders. The previous version stays in the history.',
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

  protected openSendTest(versionNumber: number | null): void {
    this.historyOpen.set(false);
    this.sendTestVersion.set(versionNumber);
    this.sendTestOpen.set(true);
    setTimeout(() => this.sendTest()?.reset(), 0);
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
      message: current.isSystem
        ? 'This is a system template. While it is inactive the workflow that sends it fails visibly — for Auth.EmailOtp, nobody can sign in.'
        : 'Production sends of this template will fail until it is reactivated.',
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
        void this.router.navigate(['/email-templates']);
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not archive this template.'),
    });
  }

  /** The route's canDeactivate: leaving with unsaved edits asks first. */
  canLeave(): Promise<boolean> {
    return this.discardGuard(this.form);
  }
}
