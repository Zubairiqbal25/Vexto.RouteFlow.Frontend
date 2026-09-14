import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TemplateVariable } from '@vexto/models';
import { VxEmptyState, VxIcon } from '@vexto/ui';

/**
 * The variables a template may use, beside the editor.
 *
 * Each row is the placeholder as it must be typed, what it means, and whether it is required.
 * Clicking one inserts it at the editor's caret — the editor decides where — so an administrator
 * never has to remember whether it was `OtpCode` or `OTPCode`. The two platform variables every
 * template gets for free are listed too, because a footer that wants the year should not have to
 * guess that `CurrentYear` exists.
 */
@Component({
  selector: 'vexto-variable-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxEmptyState, VxIcon],
  host: { class: 'block' },
  template: `
    <div class="vx-card overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
        <h3 class="text-body font-semibold text-ink">Available variables</h3>
        @if (editable()) {
          <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="manage.emit()">
            <vx-icon name="edit" [size]="14" />
            Edit list
          </button>
        }
      </div>

      @if (variables().length === 0) {
        <vx-empty-state
          icon="code"
          title="No variables declared"
          description="Declare the variables this template uses so the renderer can check them and the preview can fill them."
        />
      } @else {
        <ul class="divide-y divide-line-subtle">
          @for (variable of variables(); track variable.name) {
            <li>
              <button
                type="button"
                class="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-start transition-colors hover:bg-surface-muted"
                [attr.aria-label]="'Insert ' + variable.name"
                (click)="insert.emit(variable.name)"
              >
                <span class="flex w-full items-center gap-2">
                  <code class="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-meta text-ink">
                    {{ '{{ ' + variable.name + ' }}' }}
                  </code>
                  @if (variable.required) {
                    <span class="vx-badge vx-tone-warning">Required</span>
                  }
                  <span class="ms-auto text-meta text-ink-muted">{{ variable.kind }}</span>
                </span>
                @if (variable.description) {
                  <span class="text-meta text-ink-muted">{{ variable.description }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }

      <div class="border-t border-line-subtle px-4 py-3">
        <p class="text-meta font-medium text-ink-muted">Always available</p>
        <ul class="mt-1.5 flex flex-col gap-1">
          @for (name of platformVariables; track name) {
            <li>
              <button type="button" class="font-mono text-meta text-primary hover:underline" (click)="insert.emit(name)">
                {{ '{{ ' + name + ' }}' }}
              </button>
            </li>
          }
        </ul>
        <p class="mt-2 text-meta text-ink-muted">
          Optional variables can be tested with
          <code class="font-mono">{{ '{{ if TenantName }}…{{ end }}' }}</code>.
        </p>
      </div>
    </div>
  `,
})
export class VariablePanel {
  readonly variables = input.required<readonly TemplateVariable[]>();
  readonly editable = input(true);
  readonly insert = output<string>();
  readonly manage = output<void>();

  /** Mirrors `TemplateVariables.Platform` on the server. */
  protected readonly platformVariables = ['VextoName', 'CurrentYear'];
}
