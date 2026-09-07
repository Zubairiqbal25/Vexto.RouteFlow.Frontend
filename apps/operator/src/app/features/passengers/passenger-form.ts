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
import { PassengersApi, VextoApiError } from '@vexto/api-client';
import type { PassengerResponse } from '@vexto/models';
import { ToastService, VxField, VxFormSection, VxModal } from '@vexto/ui';
import { InvitePanel, type InvitationGateway } from '../../shared/invite-panel';

/**
 * Add or edit a passenger, in a drawer.
 *
 * A passenger is five fields; sending someone to a full page and back for that is friction. The
 * same component covers both cases because "create" and "edit" differ only in the request.
 */
@Component({
  selector: 'vexto-passenger-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxModal, VxField, VxFormSection, InvitePanel],
  template: `
    <vx-modal
      variant="drawer"
      [open]="open()"
      [dismissable]="!busy()"
      [title]="passenger() ? 'Edit passenger' : 'Add passenger'"
      [description]="
        passenger() ? 'Update these details.' : 'Register someone for transport access.'
      "
      (closed)="dismissed.emit()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" id="passenger-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Passenger" description="How this person appears on manifests.">
          <vx-field
            label="First name"
            for="firstName"
            [required]="true"
            [control]="form.controls.firstName"
            [error]="fieldError('firstName')"
          >
            <input id="firstName" class="vx-input" formControlName="firstName" />
          </vx-field>

          <vx-field
            label="Last name"
            for="lastName"
            [required]="true"
            [control]="form.controls.lastName"
            [error]="fieldError('lastName')"
          >
            <input id="lastName" class="vx-input" formControlName="lastName" />
          </vx-field>
        </vx-form-section>

        <vx-form-section title="Contact" description="Used to reach the passenger about their trips.">
          <vx-field
            label="Mobile number"
            for="mobileNumber"
            [required]="true"
            help="UAE format, for example +971501234567."
            [control]="form.controls.mobileNumber"
            [error]="fieldError('mobileNumber')"
          >
            <input
              id="mobileNumber"
              class="vx-input"
              inputmode="tel"
              formControlName="mobileNumber"
            />
          </vx-field>

          <vx-field
            label="Email"
            for="email"
            [control]="form.controls.email"
            [error]="fieldError('email')"
          >
            <input id="email" type="email" class="vx-input" formControlName="email" />
          </vx-field>

          <vx-field label="Notes" for="notes" [wide]="true" [error]="fieldError('notes')">
            <textarea id="notes" rows="3" class="vx-textarea" formControlName="notes"></textarea>
          </vx-field>
        </vx-form-section>
      </form>

      <!--
        App access only makes sense for somebody who already exists: there is no record to attach
        an account to while the form is still creating one.
      -->
      @if (passenger(); as existing) {
        <div class="mt-6 border-t border-line-subtle pt-5">
          <vexto-invite-panel
            #invitePanel
            [gateway]="inviteGateway(existing.id)"
            [subject]="existing.firstName"
          />
        </div>
      }

      <button type="button" footer class="vx-btn vx-btn-secondary" [disabled]="busy()" (click)="dismissed.emit()">
        Cancel
      </button>
      <button type="submit" footer form="passenger-form"
        (click)="submit()" class="vx-btn vx-btn-primary" [disabled]="busy()">
        {{ busy() ? 'Saving…' : passenger() ? 'Save changes' : 'Add passenger' }}
      </button>
    </vx-modal>
  `,
})
export class PassengerForm {
  private readonly api = inject(PassengersApi);
  private readonly toast = inject(ToastService);

  /** The panel, so its status can be loaded once the dialog opens on an existing passenger. */
  private readonly invitePanel = viewChild<InvitePanel>('invitePanel');

  readonly open = input(false);
  /** Null creates; a passenger edits. */
  readonly passenger = input<PassengerResponse | null>(null);
  readonly dismissed = output<void>();
  readonly saved = output<PassengerResponse>();

  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverErrors = signal<VextoApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    mobileNumber: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', [Validators.email]],
    notes: [''],
  });

  constructor() {
    // Re-seed whenever the drawer opens, so a cancelled edit does not leak into the next one.
    effect(() => {
      if (!this.open()) {
        return;
      }

      const existing = this.passenger();

      this.form.reset({
        firstName: existing?.firstName ?? '',
        lastName: existing?.lastName ?? '',
        mobileNumber: existing?.mobileNumber ?? '',
        email: existing?.email ?? '',
        notes: existing?.notes ?? '',
      });
      this.formError.set(null);

      // Loaded when the drawer opens on an existing passenger. The panel is not rendered at all
      // while creating one, so there is nothing to ask about.
      if (existing) {
        this.invitePanel()?.load();
      }
      this.serverErrors.set(null);
    });
  }

  /**
   * The four invitation calls for this passenger, handed to the shared panel.
   *
   * Built here rather than inside the panel so that the same component serves drivers too — the
   * flow is identical and only the URLs differ.
   */
  protected inviteGateway(passengerId: string): InvitationGateway {
    return {
      status: () => this.api.invitationStatus(passengerId),
      invite: (email: string) => this.api.invite(passengerId, email),
      resend: () => this.api.resendInvitation(passengerId),
      revoke: () => this.api.revokeInvitation(passengerId),
    };
  }

  /** A per-field message returned by the API, shown under the matching control. */
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
    const existing = this.passenger();

    const request = existing
      ? this.api.update(existing.id, {
          passengerId: existing.id,
          firstName: value.firstName,
          lastName: value.lastName,
          mobileNumber: value.mobileNumber,
          email: value.email || null,
          notes: value.notes || null,
        })
      : this.api.create({
          firstName: value.firstName,
          lastName: value.lastName,
          mobileNumber: value.mobileNumber,
          email: value.email || null,
          notes: value.notes || null,
        });

    request.subscribe({
      next: (passenger) => {
        this.busy.set(false);
        this.toast.success(existing ? 'Passenger updated.' : 'Passenger added.');
        this.saved.emit(passenger);
      },
      error: (error: unknown) => {
        this.busy.set(false);

        if (error instanceof VextoApiError) {
          this.serverErrors.set(error);
          this.formError.set(error.kind === 'validation' ? null : error.message);
        } else {
          this.formError.set('We could not save this passenger.');
        }
      },
    });
  }
}
