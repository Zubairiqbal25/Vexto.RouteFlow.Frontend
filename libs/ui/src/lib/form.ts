import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/**
 * Label, control, help text and validation message — always in that order, always spaced the same.
 *
 * The component owns the *chrome*; the caller projects the real input, so a select, a date field or
 * a PrimeNG control all sit in the same frame. The `for`/`id` pairing is the caller's job because
 * only the caller knows the control's id.
 */
@Component({
  selector: 'vx-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vx-field" [class.vx-span-2]="wide()">
      <label class="vx-label" [class.vx-required]="required()" [attr.for]="for()">
        {{ label() }}
      </label>
      <ng-content />
      @if (message(); as text) {
        <p class="vx-error">{{ text }}</p>
      } @else if (help(); as text) {
        <p class="vx-help">{{ text }}</p>
      }
    </div>
  `,
})
export class VxField {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly help = input<string | null>(null);
  readonly required = input(false);
  readonly wide = input(false);

  /** The control to read validation state from; omit and pass `error` directly if simpler. */
  readonly control = input<AbstractControl | null>(null);
  /** A server-side error for this field, from `VextoApiError.fieldError(...)`. */
  readonly error = input<string | null>(null);

  protected readonly message = computed(() => {
    const serverError = this.error();

    if (serverError) {
      return serverError;
    }

    const control = this.control();

    if (!control || control.valid || !(control.touched || control.dirty)) {
      return null;
    }

    return describe(control, this.label());
  });
}

/** Turns Angular's validation flags into a sentence a user can act on. */
function describe(control: AbstractControl, label: string): string {
  const errors = control.errors ?? {};

  if (errors['required']) {
    return `${label} is required.`;
  }

  if (errors['email']) {
    return 'Enter a valid email address.';
  }

  if (errors['minlength']) {
    const requirement = errors['minlength'] as { requiredLength: number };

    return `${label} must be at least ${requirement.requiredLength} characters.`;
  }

  if (errors['maxlength']) {
    const requirement = errors['maxlength'] as { requiredLength: number };

    return `${label} must be ${requirement.requiredLength} characters or fewer.`;
  }

  if (errors['min']) {
    const requirement = errors['min'] as { min: number };

    return `${label} must be at least ${requirement.min}.`;
  }

  if (errors['max']) {
    const requirement = errors['max'] as { max: number };

    return `${label} must be ${requirement.max} or less.`;
  }

  if (errors['pattern']) {
    return `${label} is not in the expected format.`;
  }

  return `${label} is not valid.`;
}

/** A titled group of fields inside a form. Forms are read in sections, not as one long column. */
@Component({
  selector: 'vx-form-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vx-form-section">
      <div>
        <h3 class="text-sm font-semibold text-ink">{{ title() }}</h3>
        @if (description(); as text) {
          <p class="mt-0.5 text-meta text-ink-muted">{{ text }}</p>
        }
      </div>
      <div class="vx-form-grid">
        <ng-content />
      </div>
    </div>
  `,
})
export class VxFormSection {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
