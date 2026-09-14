import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmailTemplatesApi, VextoApiError } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { TemplateVariable } from '@vexto/models';
import { VxIcon, VxModal } from '@vexto/ui';
import { sampleValues, type SampleValueMap, toVariableValues } from './sample-values';

/**
 * "Send test email": a recipient, the variables pre-filled with their samples, one button.
 *
 * The recipient defaults to the signed-in administrator's own address, because that is who is
 * testing. The outcome is reported in the administrator's terms — sent, or the relay refused it —
 * and never with the provider's own error text, which the server keeps to its log.
 */
@Component({
  selector: 'vexto-send-test-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, VxIcon, VxModal],
  template: `
    <vx-modal
      [open]="open()"
      title="Send test email"
      [description]="'Sends ' + (versionNumber() ? 'version ' + versionNumber() : 'the working copy') + ' through the platform mail provider. Nothing else is changed.'"
      [dismissable]="!busy()"
      (closed)="close()"
    >
      <form class="flex flex-col gap-4 pb-4" (submit)="send($event)">
        <label class="flex flex-col gap-1">
          <span class="text-meta font-medium text-ink-muted">Recipient</span>
          <input
            id="send-test-email"
            type="email"
            class="vx-input"
            name="email"
            autocomplete="email"
            required
            [(ngModel)]="email"
          />
        </label>

        @if (variables().length > 0) {
          <fieldset class="flex flex-col gap-3">
            <legend class="text-meta font-medium text-ink-muted">Variables</legend>
            @for (variable of variables(); track variable.name) {
              <div class="flex flex-col gap-1">
                <label class="flex items-center gap-2 font-mono text-meta text-ink" [for]="'test-var-' + variable.name">
                  {{ variable.name }}
                  @if (variable.required) {
                    <span class="vx-badge vx-tone-warning">Required</span>
                  }
                </label>
                @if (variable.kind === 'Collection') {
                  <textarea class="vx-input font-mono text-[12px]" rows="3" [id]="'test-var-' + variable.name" [name]="variable.name" [(ngModel)]="values[variable.name]"></textarea>
                } @else {
                  <input class="vx-input" [id]="'test-var-' + variable.name" [name]="variable.name" [(ngModel)]="values[variable.name]" />
                }
              </div>
            }
          </fieldset>
        }

        @if (result(); as outcome) {
          <div
            class="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body"
            [style.background]="outcome.sent ? 'var(--vexto-success-soft)' : 'var(--vexto-danger-soft)'"
            [style.color]="outcome.sent ? 'var(--vexto-success-text)' : 'var(--vexto-danger-text)'"
            role="status"
          >
            <vx-icon [name]="outcome.sent ? 'check-circle' : 'alert'" [size]="17" />
            <span>{{ outcome.message }}</span>
          </div>
        }
      </form>

      <button footer type="button" class="vx-btn vx-btn-secondary" [disabled]="busy()" (click)="close()">
        {{ result()?.sent ? 'Done' : 'Cancel' }}
      </button>
      <button footer type="button" class="vx-btn vx-btn-primary" [disabled]="busy() || !email" (click)="send()">
        <vx-icon name="send" [size]="16" />
        {{ busy() ? 'Sending…' : 'Send' }}
      </button>
    </vx-modal>
  `,
})
export class SendTestDialog {
  private readonly api = inject(EmailTemplatesApi);
  private readonly store = inject(AuthStore);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly open = input(false);
  readonly templateId = input.required<string>();
  readonly variables = input.required<readonly TemplateVariable[]>();
  readonly versionNumber = input<number | null>(null);
  readonly closed = output<void>();

  protected email = '';
  protected values: SampleValueMap = {};
  protected readonly busy = signal(false);
  protected readonly result = signal<{ sent: boolean; message: string } | null>(null);

  /** Called by the host when it opens the dialog, so the fields reflect the current template. */
  reset(): void {
    this.email = this.store.user()?.email ?? '';
    this.values = sampleValues(this.variables());
    this.result.set(null);
    this.busy.set(false);

    // Plain fields behind ngModel, set from outside a template event: the view is told explicitly.
    this.changeDetector.markForCheck();
  }

  protected send(event?: Event): void {
    event?.preventDefault();

    if (this.busy() || !this.email) {
      return;
    }

    this.busy.set(true);
    this.result.set(null);

    this.api
      .sendTest(this.templateId(), {
        email: this.email.trim(),
        variables: toVariableValues(this.variables(), this.values),
        versionNumber: this.versionNumber(),
      })
      .subscribe({
        next: (outcome) => {
          this.busy.set(false);
          this.result.set({ sent: outcome.sent, message: outcome.message });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.result.set({
            sent: false,
            message: error instanceof VextoApiError && error.kind !== 'unknown' ? error.message : 'The test email could not be sent.',
          });
        },
      });
  }

  protected close(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }
}
