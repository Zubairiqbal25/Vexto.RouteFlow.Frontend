import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DriversApi, VextoApiError } from '@vexto/api-client';
import type { DriverResponse } from '@vexto/models';
import { InvitePanel, type InvitationGateway } from '../../shared/invite-panel';
import { ToastService, VxField, VxFormSection, VxModal } from '@vexto/ui';

@Component({
  selector: 'vexto-driver-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxModal, VxField, VxFormSection, InvitePanel],
  template: `
    <vx-modal
      variant="drawer"
      [open]="open()"
      [dismissable]="!busy()"
      [title]="driver() ? 'Edit driver' : 'Add driver'"
      description="Drivers must hold a valid licence before they can be activated."
      (closed)="dismissed.emit()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" id="driver-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Driver">
          <vx-field
            label="First name"
            for="d-firstName"
            [required]="true"
            [control]="form.controls.firstName"
            [error]="fieldError('firstName')"
          >
            <input id="d-firstName" class="vx-input" formControlName="firstName" />
          </vx-field>
          <vx-field
            label="Last name"
            for="d-lastName"
            [required]="true"
            [control]="form.controls.lastName"
            [error]="fieldError('lastName')"
          >
            <input id="d-lastName" class="vx-input" formControlName="lastName" />
          </vx-field>
        </vx-form-section>

        <vx-form-section title="Contact">
          <vx-field
            label="Mobile number"
            for="d-mobile"
            [required]="true"
            [control]="form.controls.mobileNumber"
            [error]="fieldError('mobileNumber')"
          >
            <input id="d-mobile" class="vx-input" inputmode="tel" formControlName="mobileNumber" />
          </vx-field>
          <vx-field
            label="Email"
            for="d-email"
            [control]="form.controls.email"
            [error]="fieldError('email')"
          >
            <input id="d-email" type="email" class="vx-input" formControlName="email" />
          </vx-field>
        </vx-form-section>

        <vx-form-section title="Licence" description="Checked before a driver can be assigned to a trip.">
          <vx-field
            label="Licence number"
            for="d-licence"
            [required]="true"
            [control]="form.controls.licenseNumber"
            [error]="fieldError('licenseNumber')"
          >
            <input id="d-licence" class="vx-input" formControlName="licenseNumber" />
          </vx-field>
          <vx-field
            label="Licence expiry"
            for="d-expiry"
            [required]="true"
            [control]="form.controls.licenseExpiryDate"
            [error]="fieldError('licenseExpiryDate')"
          >
            <input id="d-expiry" type="date" class="vx-input" formControlName="licenseExpiryDate" />
          </vx-field>
          <vx-field label="Notes" for="d-notes" [wide]="true" [error]="fieldError('notes')">
            <textarea id="d-notes" rows="3" class="vx-textarea" formControlName="notes"></textarea>
          </vx-field>
        </vx-form-section>
      </form>

      <!-- Only for a driver who already exists; there is nothing to attach an account to yet. -->
      @if (driver(); as existing) {
        <div class="mt-6 border-t border-line-subtle pt-5">
          <vexto-invite-panel
            #invitePanel
            [gateway]="inviteGateway(existing.id)"
            [subject]="existing.firstName"
          />
        </div>
      }

      <button
        type="button"
        footer
        class="vx-btn vx-btn-secondary"
        [disabled]="busy()"
        (click)="dismissed.emit()"
      >
        Cancel
      </button>
      <button
        type="submit"
        footer
        form="driver-form"
        (click)="submit()"
        class="vx-btn vx-btn-primary"
        [disabled]="busy()"
      >
        {{ busy() ? 'Saving…' : driver() ? 'Save changes' : 'Add driver' }}
      </button>
    </vx-modal>
  `,
})
export class DriverForm {
  private readonly api = inject(DriversApi);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly driver = input<DriverResponse | null>(null);

  /** The panel, so its status can be loaded once the drawer opens on an existing driver. */
  private readonly invitePanel = viewChild<InvitePanel>('invitePanel');
  readonly dismissed = output<void>();
  readonly saved = output<DriverResponse>();

  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverErrors = signal<VextoApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    mobileNumber: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', [Validators.email]],
    licenseNumber: ['', [Validators.required, Validators.maxLength(60)]],
    licenseExpiryDate: ['', [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }

      const existing = this.driver();

      this.form.reset({
        firstName: existing?.firstName ?? '',
        lastName: existing?.lastName ?? '',
        mobileNumber: existing?.mobileNumber ?? '',
        email: existing?.email ?? '',
        licenseNumber: existing?.licenseNumber ?? '',
        // The API sends a plain ISO date, which is exactly what <input type="date"> wants.
        licenseExpiryDate: existing?.licenseExpiryDate ?? '',
        notes: existing?.notes ?? '',
      });
      this.formError.set(null);
      this.serverErrors.set(null);

      // Loaded when the drawer opens on an existing driver. Not rendered at all while creating one.
      if (existing) {
        this.invitePanel()?.load();
      }
    });
  }

  /** The four invitation calls for this driver. Same flow as passengers; different URLs. */
  protected inviteGateway(driverId: string): InvitationGateway {
    return {
      status: () => this.api.invitationStatus(driverId),
      invite: (email: string) => this.api.invite(driverId, email),
      resend: () => this.api.resendInvitation(driverId),
      revoke: () => this.api.revokeInvitation(driverId),
    };
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
    const existing = this.driver();

    const request = existing
      ? this.api.update(existing.id, {
          driverId: existing.id,
          firstName: value.firstName,
          lastName: value.lastName,
          mobileNumber: value.mobileNumber,
          email: value.email || null,
          licenseNumber: value.licenseNumber,
          licenseExpiryDate: value.licenseExpiryDate,
          notes: value.notes || null,
        })
      : this.api.create({
          firstName: value.firstName,
          lastName: value.lastName,
          mobileNumber: value.mobileNumber,
          email: value.email || null,
          licenseNumber: value.licenseNumber,
          licenseExpiryDate: value.licenseExpiryDate,
          notes: value.notes || null,
        });

    request.subscribe({
      next: (driver) => {
        this.busy.set(false);
        this.toast.success(existing ? 'Driver updated.' : 'Driver added.');
        this.saved.emit(driver);
      },
      error: (error: unknown) => {
        this.busy.set(false);

        if (error instanceof VextoApiError) {
          this.serverErrors.set(error);
          this.formError.set(error.kind === 'validation' ? null : error.message);
        } else {
          this.formError.set('We could not save this driver.');
        }
      },
    });
  }
}
