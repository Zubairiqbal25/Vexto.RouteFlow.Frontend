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
import { VehiclesApi, VextoApiError } from '@vexto/api-client';
import type { Emirate, VehicleResponse, VehicleType } from '@vexto/models';
import { ToastService, VxField, VxFormSection, VxModal } from '@vexto/ui';
import { unsavedChangesGuard } from '../../shared/unsaved-changes';
import { humanizeEnum } from '@vexto/utilities';

const VEHICLE_TYPES: readonly NonNullable<VehicleType>[] = ['Bus', 'MiniBus', 'Van', 'Car', 'Other'];

const EMIRATES: readonly NonNullable<Emirate>[] = [
  'AbuDhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'UmmAlQuwain',
  'RasAlKhaimah',
  'Fujairah',
];

/**
 * A vehicle has enough fields to deserve grouping — registration first, then the vehicle itself.
 * That is the difference between a form someone can scan and one they have to read.
 */
@Component({
  selector: 'vexto-vehicle-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxModal, VxField, VxFormSection],
  template: `
    <vx-modal
      variant="drawer"
      [open]="open()"
      [dismissable]="!busy()"
      [title]="vehicle() ? 'Edit vehicle' : 'Add vehicle'"
      description="Vehicles are assigned to routes and carry passengers on trips."
      (closed)="tryDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" id="vehicle-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Registration" description="As printed on the number plate.">
          <vx-field
            label="Plate number"
            for="v-plate"
            [required]="true"
            [control]="form.controls.plateNumber"
            [error]="fieldError('plateNumber')"
          >
            <input id="v-plate" class="vx-input" formControlName="plateNumber" />
          </vx-field>

          <vx-field label="Plate code" for="v-code" [error]="fieldError('plateCode')">
            <input id="v-code" class="vx-input" formControlName="plateCode" />
          </vx-field>

          <vx-field label="Emirate" for="v-emirate" [error]="fieldError('emirate')">
            <select id="v-emirate" class="vx-select" formControlName="emirate">
              <option value="">Not specified</option>
              @for (emirate of emirates; track emirate) {
                <option [value]="emirate">{{ label(emirate) }}</option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Vehicle type"
            for="v-type"
            [required]="true"
            [error]="fieldError('vehicleType')"
          >
            <select id="v-type" class="vx-select" formControlName="vehicleType">
              @for (type of vehicleTypes; track type) {
                <option [value]="type">{{ label(type) }}</option>
              }
            </select>
          </vx-field>
        </vx-form-section>

        <vx-form-section title="Vehicle details">
          <vx-field label="Make" for="v-make" [error]="fieldError('make')">
            <input id="v-make" class="vx-input" formControlName="make" />
          </vx-field>

          <vx-field label="Model" for="v-model" [error]="fieldError('model')">
            <input id="v-model" class="vx-input" formControlName="model" />
          </vx-field>

          <vx-field label="Year" for="v-year" [error]="fieldError('year')">
            <input
              id="v-year"
              type="number"
              class="vx-input"
              inputmode="numeric"
              formControlName="year"
            />
          </vx-field>

          <vx-field
            label="Capacity"
            for="v-capacity"
            [required]="true"
            help="Seats available to passengers."
            [control]="form.controls.capacity"
            [error]="fieldError('capacity')"
          >
            <input
              id="v-capacity"
              type="number"
              class="vx-input"
              inputmode="numeric"
              formControlName="capacity"
            />
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
        form="vehicle-form"
        (click)="submit()"
        class="vx-btn vx-btn-primary"
        [disabled]="busy()"
      >
        {{ busy() ? 'Saving…' : vehicle() ? 'Save changes' : 'Add vehicle' }}
      </button>
    </vx-modal>
  `,
})
export class VehicleForm {
  private readonly api = inject(VehiclesApi);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly vehicle = input<VehicleResponse | null>(null);
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
  readonly saved = output<VehicleResponse>();

  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected readonly emirates = EMIRATES;
  protected readonly label = humanizeEnum;

  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverErrors = signal<VextoApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    plateNumber: ['', [Validators.required, Validators.maxLength(20)]],
    plateCode: [''],
    emirate: [''],
    vehicleType: ['Bus', [Validators.required]],
    make: [''],
    model: [''],
    year: [null as number | null],
    capacity: [0, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }

      const existing = this.vehicle();

      this.form.reset({
        plateNumber: existing?.plateNumber ?? '',
        plateCode: existing?.plateCode ?? '',
        emirate: existing?.emirate ?? '',
        vehicleType: existing?.vehicleType ?? 'Bus',
        make: existing?.make ?? '',
        model: existing?.model ?? '',
        year: existing?.year ?? null,
        capacity: existing?.capacity ?? 0,
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
      plateNumber: value.plateNumber,
      plateCode: value.plateCode || null,
      emirate: (value.emirate || null) as Emirate,
      vehicleType: value.vehicleType as NonNullable<VehicleType>,
      make: value.make || null,
      model: value.model || null,
      year: value.year === null ? null : Number(value.year),
      capacity: Number(value.capacity),
    };

    const existing = this.vehicle();

    const request = existing
      ? this.api.update(existing.id, { vehicleId: existing.id, ...shared })
      : this.api.create(shared);

    request.subscribe({
      next: (vehicle) => {
        this.busy.set(false);
        this.toast.success(existing ? 'Vehicle updated.' : 'Vehicle added.');
        this.saved.emit(vehicle);
      },
      error: (error: unknown) => {
        this.busy.set(false);

        if (error instanceof VextoApiError) {
          this.serverErrors.set(error);
          this.formError.set(error.kind === 'validation' ? null : error.message);
        } else {
          this.formError.set('We could not save this vehicle.');
        }
      },
    });
  }
}
