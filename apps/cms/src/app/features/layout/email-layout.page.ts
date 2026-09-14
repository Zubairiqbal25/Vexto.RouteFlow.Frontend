import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContentApi, EmailTemplatesApi, VextoApiError } from '@vexto/api-client';
import { ConfirmService, ToastService, VxErrorState, VxField, VxFormSection, VxIcon, VxPageHeader } from '@vexto/ui';
import { formatDateTime } from '@vexto/utilities';
import { CodeEditor } from '../../shared/code-editor';
import { PreviewFrame } from '../../shared/preview-frame';

/**
 * The one frame every platform email is rendered inside: brand, colours, footer.
 *
 * No versions and no draft: the layout changes rarely and takes effect on the next send, so
 * saving it is confirmed like a publish is. The preview renders `Auth.EmailOtp` inside the saved
 * frame, because that is the email every person on the platform receives.
 */
@Component({
  selector: 'vexto-email-layout-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CodeEditor, PreviewFrame, VxErrorState, VxField, VxFormSection, VxIcon, VxPageHeader],
  template: `
    <vx-page-header title="Email Layout" description="The frame every email is rendered inside. Templates supply the words; this supplies the brand.">
      <span actions class="flex items-center gap-2">
        @if (updatedAt(); as when) {
          <span class="text-meta text-ink-muted">Updated {{ when }}</span>
        }
        <button type="button" class="vx-btn vx-btn-primary" [disabled]="saving() || !form.dirty" (click)="save()">
          <vx-icon name="check" [size]="16" />
          {{ saving() ? 'Saving…' : 'Save layout' }}
        </button>
      </span>
    </vx-page-header>

    @if (loadError(); as message) {
      <vx-error-state title="We could not load the layout" [message]="message" (retry)="load()" />
    } @else {
      @if (formError(); as message) {
        <div class="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body" style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)" role="alert">
          <vx-icon name="alert" [size]="17" />
          <span>{{ message }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-6 xl:grid-cols-2">
        <div class="flex flex-col gap-6">
          <vx-form-section title="HTML frame" description="Must place {{ '{{ Body }}' }} where the template's body goes. {{ '{{ Subject }}' }}, {{ '{{ VextoName }}' }} and {{ '{{ CurrentYear }}' }} are available. Inline styles only — email clients ignore the rest.">
            <vx-field label="HTML" for="layout-html" [required]="true" [control]="form.controls.htmlTemplate">
              <vexto-code-editor inputId="layout-html" label="HTML frame" formControlName="htmlTemplate" minHeight="420px" />
            </vx-field>
          </vx-form-section>
          <vx-form-section title="Plain-text frame" description="The same, for the text alternative.">
            <vx-field label="Text" for="layout-text" [required]="true" [control]="form.controls.textTemplate">
              <vexto-code-editor inputId="layout-text" label="Text frame" formControlName="textTemplate" minHeight="160px" />
            </vx-field>
          </vx-form-section>
        </div>

        <div class="vx-card p-4 sm:p-5">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-body font-semibold text-ink">Preview with Auth.EmailOtp</h3>
            <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" [disabled]="previewLoading()" (click)="preview()">
              <vx-icon name="refresh" [size]="14" />
              Refresh
            </button>
          </div>
          <p class="mb-3 text-meta text-ink-muted">Shows the saved layout. Save first to see a change here.</p>
          @if (previewHtml(); as html) {
            <vexto-preview-frame [html]="html" title="Layout preview" />
          } @else if (previewError(); as message) {
            <vx-error-state title="The layout does not render" [message]="message" (retry)="preview()" />
          } @else {
            <div class="vx-skeleton h-96 w-full"></div>
          }
        </div>
      </form>
    }
  `,
})
export class EmailLayoutPage {
  private readonly api = inject(ContentApi);
  private readonly templates = inject(EmailTemplatesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    htmlTemplate: ['', Validators.required],
    textTemplate: ['', Validators.required],
  });

  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly updatedAt = signal<string | null>(null);
  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly previewLoading = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadError.set(null);

    this.api.layout().subscribe({
      next: (layout) => {
        this.form.reset({ htmlTemplate: layout.htmlTemplate, textTemplate: layout.textTemplate });
        this.updatedAt.set(layout.updatedAtUtc ? formatDateTime(layout.updatedAtUtc) : null);
        this.preview();
      },
      error: (error: unknown) => this.loadError.set(error instanceof VextoApiError ? error.message : 'We could not load the layout.'),
    });
  }

  protected preview(): void {
    this.previewLoading.set(true);
    this.previewError.set(null);

    this.templates.getByCode('Auth.EmailOtp').subscribe({
      next: (otp) =>
        this.templates.preview(otp.id, {}).subscribe({
          next: (preview) => {
            this.previewLoading.set(false);
            this.previewHtml.set(preview.html);
          },
          error: (error: unknown) => {
            this.previewLoading.set(false);
            this.previewError.set(error instanceof VextoApiError ? error.message : 'The preview could not be rendered.');
          },
        }),
      error: () => {
        this.previewLoading.set(false);
        this.previewError.set('Auth.EmailOtp is not available to preview with.');
      },
    });
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    const confirmed = await this.confirm.ask({
      title: 'Save the email layout?',
      message: 'Every email the platform sends from now on — sign-in codes included — is rendered inside this frame. There is no draft: the change is live on save.',
      confirmLabel: 'Save layout',
    });

    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    this.api.updateLayout(this.form.getRawValue()).subscribe({
      next: (layout) => {
        this.saving.set(false);
        this.form.reset({ htmlTemplate: layout.htmlTemplate, textTemplate: layout.textTemplate });
        this.updatedAt.set(layout.updatedAtUtc ? formatDateTime(layout.updatedAtUtc) : null);
        this.toast.success('Email layout saved.');
        this.preview();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(error instanceof VextoApiError && error.kind !== 'unknown' ? error.message : 'We could not save the layout.');
      },
    });
  }
}
