import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import type { RouteDirection, RouteResponse } from '@vexto/models';
import { ToastService, VxField, VxFormSection, VxModal } from '@vexto/ui';
import { unsavedChangesGuard } from '../../shared/unsaved-changes';

const DIRECTIONS: readonly RouteDirection[] = ['Outbound', 'Return', 'Circular', 'Other'];

@Component({
  selector: 'vexto-route-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxModal, VxField, VxFormSection],
  template: `
    <vx-modal
      variant="drawer"
      [open]="open()"
      [dismissable]="!busy()"
      [title]="route() ? 'Edit route' : 'New route'"
      description="A route is a repeatable journey. Stops, passengers and schedules are added next."
      (closed)="tryDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" id="route-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Route" description="How dispatchers will recognise this route.">
          <vx-field
            label="Code"
            for="r-code"
            [required]="true"
            help="Short and unique, for example DSO-BB-AM."
            [control]="form.controls.code"
            [error]="fieldError('code')"
          >
            <input id="r-code" class="vx-input" formControlName="code" />
          </vx-field>

          <vx-field
            label="Direction"
            for="r-direction"
            [required]="true"
            [error]="fieldError('direction')"
          >
            <select id="r-direction" class="vx-select" formControlName="direction">
              @for (direction of directions; track direction) {
                <option [value]="direction">{{ direction }}</option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Name"
            for="r-name"
            [required]="true"
            [wide]="true"
            help="For example: Dubai Silicon Oasis to Business Bay."
            [control]="form.controls.name"
            [error]="fieldError('name')"
          >
            <input id="r-name" class="vx-input" formControlName="name" />
          </vx-field>

          <vx-field
            label="Description"
            for="r-description"
            [wide]="true"
            [error]="fieldError('description')"
          >
            <textarea
              id="r-description"
              rows="3"
              class="vx-textarea"
              formControlName="description"
            ></textarea>
          </vx-field>
        </vx-form-section>

        <vx-form-section
          title="Timing"
          description="The default departure time used when a schedule does not state one."
        >
          <vx-field label="Default start time" for="r-start" [error]="fieldError('defaultStartTime')">
            <input id="r-start" type="time" class="vx-input" formControlName="defaultStartTime" />
          </vx-field>
        </vx-form-section>
      </form>

      <button
        type="button"
        footer
        class="vx-btn vx-btn-secondary"
        [disabled]="busy()"
        (click)="tryDismiss()"
      >
        Cancel
      </button>
      <button
        type="submit"
        footer
        form="route-form"
        (click)="submit()"
        class="vx-btn vx-btn-primary"
        [disabled]="busy()"
      >
        {{ busy() ? 'Saving…' : route() ? 'Save changes' : 'Create route' }}
      </button>
    </vx-modal>
  `,
})
export class RouteForm {
  private readonly api = inject(RoutesApi);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly route = input<RouteResponse | null>(null);
  readonly dismissed = output<void>();

  private readonly confirmDiscard = unsavedChangesGuard();

  /**
   * Closes the form, asking first when there is unsaved work in it.
   *
   * Every way out of this form routes through here — the close button, the backdrop and Escape all
   * raise the same event — so there is no path that quietly discards what somebody typed.
   */
  protected async tryDismiss(): Promise<void> {
    if (await this.confirmDiscard(this.form)) {
      this.dismissed.emit();
    }
  }
  readonly saved = output<RouteResponse>();

  protected readonly directions = DIRECTIONS;

  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverErrors = signal<VextoApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(30)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    direction: ['Outbound', [Validators.required]],
    defaultStartTime: [''],
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }

      const existing = this.route();

      this.form.reset({
        code: existing?.code ?? '',
        name: existing?.name ?? '',
        description: existing?.description ?? '',
        direction: existing?.direction ?? 'Outbound',
        // The API sends `HH:mm:ss`; <input type="time"> wants `HH:mm`.
        defaultStartTime: existing?.defaultStartTime?.slice(0, 5) ?? '',
      });
      this.formError.set(null);
      this.serverErrors.set(null);
    });
  }

  protected fieldError(control: string): string | null {
    return this.serverErrors()?.fieldError(control) ?? null;
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();

      return;
    }

    this.busy.set(true);
    this.formError.set(null);
    this.serverErrors.set(null);

    const value = this.form.getRawValue();
    const shared = {
      code: value.code,
      name: value.name,
      description: value.description || null,
      direction: value.direction as RouteDirection,
      defaultStartTime: value.defaultStartTime ? `${value.defaultStartTime}:00` : null,
    };

    const existing = this.route();

    const request = existing
      ? this.api.update(existing.id, { routeId: existing.id, ...shared })
      : this.api.create(shared);

    request.subscribe({
      next: (route) => {
        this.busy.set(false);
        this.toast.success(existing ? 'Route updated.' : 'Route created.');
        this.saved.emit(route);
      },
      error: (error: unknown) => {
        this.busy.set(false);

        if (error instanceof VextoApiError) {
          this.serverErrors.set(error);
          this.formError.set(error.kind === 'validation' ? null : error.message);
        } else {
          this.formError.set('We could not save this route.');
        }
      },
    });
  }
}
