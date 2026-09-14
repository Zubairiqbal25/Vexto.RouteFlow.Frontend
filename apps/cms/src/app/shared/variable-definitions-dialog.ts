import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TemplateVariable, TemplateVariableKind } from '@vexto/models';
import { VxIcon, VxModal } from '@vexto/ui';

const KINDS: readonly TemplateVariableKind[] = ['Text', 'Number', 'Date', 'Boolean', 'Collection'];
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/u;

/**
 * Declares what a template may use: name, meaning, whether it is required, its kind, and the
 * sample the preview fills it with.
 *
 * Kept as one editable table rather than a form per variable, because a template has three to
 * six of them and the whole point is to see them side by side. Nothing is saved from here; the
 * dialog hands the list back and the editor's own Save persists it with the content.
 */
@Component({
  selector: 'vexto-variable-definitions-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, VxIcon, VxModal],
  template: `
    <vx-modal
      [open]="open()"
      title="Template variables"
      description="Declared variables are checked before every send and pre-filled in previews. A sample for a collection is a JSON array of rows."
      size="lg"
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-3 pb-4">
        @for (row of rows(); track row.key; let index = $index) {
          <div class="vx-card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
            <label class="flex flex-col gap-1">
              <span class="text-meta font-medium text-ink-muted">Name</span>
              <input
                class="vx-input font-mono"
                [attr.aria-invalid]="!isValidName(row.name) || null"
                [(ngModel)]="row.name"
                [name]="'name-' + row.key"
                placeholder="OtpCode"
                spellcheck="false"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-meta font-medium text-ink-muted">Description</span>
              <input class="vx-input" [(ngModel)]="row.description" [name]="'description-' + row.key" placeholder="Six-digit login code" />
            </label>
            <button
              type="button"
              class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon sm:mt-6"
              aria-label="Remove variable"
              (click)="remove(index)"
            >
              <vx-icon name="trash" [size]="16" />
            </button>
            <label class="flex flex-col gap-1">
              <span class="text-meta font-medium text-ink-muted">Kind</span>
              <select class="vx-select" [(ngModel)]="row.kind" [name]="'kind-' + row.key">
                @for (kind of kinds; track kind) {
                  <option [value]="kind">{{ kind }}</option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-meta font-medium text-ink-muted">Sample value</span>
              <input class="vx-input" [(ngModel)]="row.sampleValue" [name]="'sample-' + row.key" placeholder="482193" />
            </label>
            <label class="flex items-center gap-2 sm:mt-6">
              <input type="checkbox" class="vx-checkbox" [(ngModel)]="row.required" [name]="'required-' + row.key" />
              <span class="text-body text-ink">Required</span>
            </label>
          </div>
        }

        <button type="button" class="vx-btn vx-btn-secondary self-start" (click)="add()">
          <vx-icon name="plus" [size]="16" />
          Add variable
        </button>

        @if (problem(); as message) {
          <p class="text-meta" style="color: var(--vexto-danger-text)" role="alert">{{ message }}</p>
        }
      </div>

      <button footer type="button" class="vx-btn vx-btn-secondary" (click)="closed.emit()">Cancel</button>
      <button footer type="button" class="vx-btn vx-btn-primary" [disabled]="problem() !== null" (click)="apply()">
        Apply
      </button>
    </vx-modal>
  `,
})
export class VariableDefinitionsDialog {
  readonly open = input(false);
  readonly variables = input.required<readonly TemplateVariable[]>();
  readonly closed = output<void>();
  readonly applied = output<TemplateVariable[]>();

  protected readonly kinds = KINDS;
  protected readonly rows = signal<EditableVariable[]>([]);

  protected readonly problem = computed(() => {
    const rows = this.rows();
    const names = rows.map((row) => row.name.trim());

    if (names.some((name) => !NAME.test(name))) {
      return 'Every variable needs a name made of letters, digits and underscores, starting with a letter.';
    }

    if (new Set(names).size !== names.length) {
      return 'Two variables have the same name.';
    }

    return null;
  });

  private counter = 0;

  /** Called by the host when it opens the dialog, so the rows start from what is declared now. */
  reset(): void {
    this.rows.set(this.variables().map((variable) => ({ ...variable, key: this.counter++ })));
  }

  protected isValidName(name: string): boolean {
    return NAME.test(name.trim());
  }

  protected add(): void {
    this.rows.update((rows) => [
      ...rows,
      { key: this.counter++, name: '', description: '', required: true, kind: 'Text', sampleValue: '' },
    ]);
  }

  protected remove(index: number): void {
    this.rows.update((rows) => rows.filter((_, position) => position !== index));
  }

  protected apply(): void {
    if (this.problem()) {
      return;
    }

    this.applied.emit(
      this.rows().map(({ key: _key, ...variable }) => ({
        ...variable,
        name: variable.name.trim(),
        description: variable.description?.trim() ?? '',
        sampleValue: variable.sampleValue?.trim() ? variable.sampleValue.trim() : null,
      })),
    );
  }
}

interface EditableVariable {
  key: number;
  name: string;
  description: string | null;
  required: boolean;
  kind: TemplateVariableKind;
  sampleValue: string | null;
}
