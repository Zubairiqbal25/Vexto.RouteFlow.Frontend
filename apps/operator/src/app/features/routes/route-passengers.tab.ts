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
import { PassengersApi, RoutesApi, VextoApiError } from '@vexto/api-client';
import type {
  PassengerResponse,
  RouteAssignmentType,
  RoutePassengerAssignment,
  RouteStop,
} from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxField,
  VxFormSection,
  VxIcon,
  VxModal,
  VxSectionCard,
  VxSkeletonTable,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate } from '@vexto/utilities';

/**
 * Who travels on this route, and from which stop.
 *
 * The picker lists active passengers only — assigning someone who has been deactivated would create
 * a manifest entry that can never board. It fetches one page of a hundred, which covers the
 * realistic case; a tenant beyond that needs a searchable picker, noted in the API gaps.
 */
@Component({
  selector: 'vexto-route-passengers-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    VxAvatar,
    VxEmptyState,
    VxErrorState,
    VxField,
    VxFormSection,
    VxIcon,
    VxModal,
    VxSectionCard,
    VxSkeletonTable,
    VxStatusBadge,
  ],
  template: `
    <vx-section-card
      title="Passengers"
      description="People assigned to this route and the stop they are collected from."
      [padded]="false"
    >
      <button
        *vxCan="manage"
        header-actions
        type="button"
        class="vx-btn vx-btn-secondary vx-btn-sm"
        [disabled]="stops().length === 0"
        (click)="openAssign()"
      >
        <vx-icon name="plus" [size]="15" />
        Assign passenger
      </button>

      @if (loading()) {
        <vx-skeleton-table [columns]="5" [rows]="4" />
      } @else if (error()) {
        <vx-error-state title="We could not load assignments" [message]="error()!" (retry)="load()" />
      } @else if (assignments().length === 0) {
        <vx-empty-state
          icon="passengers"
          title="No passengers assigned"
          [description]="
            stops().length === 0
              ? 'Add at least one stop before assigning passengers to this route.'
              : 'Assign passengers so trips generated from this route have a manifest.'
          "
        />
      } @else {
        <div class="vx-table-scroll vx-scroll">
          <table class="vx-table">
            <thead>
              <tr>
                <th scope="col">Passenger</th>
                <th scope="col">Stop</th>
                <th scope="col">Type</th>
                <th scope="col">Effective</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (assignment of assignments(); track assignment.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <vx-avatar size="sm" [name]="assignment.passengerName" />
                      <span class="vx-cell-strong">{{ assignment.passengerName }}</span>
                    </div>
                  </td>
                  <td>{{ assignment.stopName }}</td>
                  <td>{{ assignment.assignmentType }}</td>
                  <td>
                    {{ date(assignment.effectiveFrom) }}
                    @if (assignment.effectiveTo) {
                      <span class="text-ink-muted"> → {{ date(assignment.effectiveTo) }}</span>
                    }
                  </td>
                  <td><vx-status-badge [status]="assignment.status" /></td>
                  <td class="text-end">
                    <button
                      *vxCan="manage"
                      type="button"
                      class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                      [attr.aria-label]="'Remove ' + assignment.passengerName"
                      (click)="remove(assignment)"
                    >
                      <vx-icon name="trash" [size]="16" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </vx-section-card>

    <vx-modal
      [open]="formOpen()"
      [dismissable]="!saving()"
      title="Assign passenger"
      description="The passenger will appear on every trip generated for this route."
      (closed)="formOpen.set(false)"
    >
      <form [formGroup]="form" (ngSubmit)="save()" id="assign-passenger-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Assignment">
          <vx-field
            label="Passenger"
            for="a-passenger"
            [required]="true"
            [wide]="true"
            [control]="form.controls.passengerId"
          >
            <select id="a-passenger" class="vx-select" formControlName="passengerId">
              <option value="">Select a passenger</option>
              @for (passenger of candidates(); track passenger.id) {
                <option [value]="passenger.id">
                  {{ passenger.firstName }} {{ passenger.lastName }} · {{ passenger.mobileNumber }}
                </option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Pickup stop"
            for="a-stop"
            [required]="true"
            [control]="form.controls.routeStopId"
          >
            <select id="a-stop" class="vx-select" formControlName="routeStopId">
              <option value="">Select a stop</option>
              @for (stop of stops(); track stop.id) {
                <option [value]="stop.id">{{ stop.sequence }}. {{ stop.name }}</option>
              }
            </select>
          </vx-field>

          <vx-field label="Assignment type" for="a-type" [required]="true">
            <select id="a-type" class="vx-select" formControlName="assignmentType">
              <option value="Regular">Regular</option>
              <option value="Temporary">Temporary</option>
            </select>
          </vx-field>

          <vx-field
            label="Effective from"
            for="a-from"
            [required]="true"
            [control]="form.controls.effectiveFrom"
          >
            <input id="a-from" type="date" class="vx-input" formControlName="effectiveFrom" />
          </vx-field>

          <vx-field label="Effective to" for="a-to" help="Leave empty for an open-ended assignment.">
            <input id="a-to" type="date" class="vx-input" formControlName="effectiveTo" />
          </vx-field>
        </vx-form-section>
      </form>

      <button
        type="button"
        footer
        class="vx-btn vx-btn-secondary"
        [disabled]="saving()"
        (click)="formOpen.set(false)"
      >
        Cancel
      </button>
      <button
        type="submit"
        footer
        form="assign-passenger-form"
        (click)="save()"
        class="vx-btn vx-btn-primary"
        [disabled]="saving()"
      >
        {{ saving() ? 'Assigning…' : 'Assign passenger' }}
      </button>
    </vx-modal>
  `,
})
export class RoutePassengersTab {
  private readonly api = inject(RoutesApi);
  private readonly passengersApi = inject(PassengersApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly routeId = input.required<string>();
  readonly changed = output<void>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly date = formatDate;

  protected readonly assignments = signal<RoutePassengerAssignment[]>([]);
  protected readonly stops = signal<RouteStop[]>([]);
  protected readonly candidates = signal<PassengerResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    passengerId: ['', [Validators.required]],
    routeStopId: ['', [Validators.required]],
    assignmentType: ['Regular', [Validators.required]],
    effectiveFrom: [today(), [Validators.required]],
    effectiveTo: [''],
  });

  constructor() {
    effect(() => {
      this.routeId();
      this.load();
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.passengers(this.routeId()).subscribe({
      next: (assignments) => {
        this.assignments.set(assignments);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load assignments.',
        );
      },
    });

    // The stops are needed for the picker and for the empty-state wording, so they load alongside.
    this.api.stops(this.routeId()).subscribe({
      next: (stops) => this.stops.set([...stops].sort((a, b) => a.sequence - b.sequence)),
      error: () => this.stops.set([]),
    });
  }

  protected openAssign(): void {
    this.formError.set(null);
    this.form.reset({
      passengerId: '',
      routeStopId: '',
      assignmentType: 'Regular',
      effectiveFrom: today(),
      effectiveTo: '',
    });
    this.formOpen.set(true);

    this.passengersApi.list({ status: 'Active', pageSize: 100 }).subscribe({
      next: (result) => this.candidates.set(result.items),
      error: () => this.toast.error('We could not load the passenger list.'),
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();

      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const value = this.form.getRawValue();

    this.api
      .assignPassenger(this.routeId(), {
        passengerId: value.passengerId,
        routeStopId: value.routeStopId,
        assignmentType: value.assignmentType as RouteAssignmentType,
        effectiveFrom: value.effectiveFrom,
        effectiveTo: value.effectiveTo || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.toast.success('Passenger assigned.');
          this.load();
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            error instanceof VextoApiError ? error.message : 'We could not assign this passenger.',
          );
        },
      });
  }

  protected async remove(assignment: RoutePassengerAssignment): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove from route?',
      message: `${assignment.passengerName} will not appear on trips generated from this route.`,
      confirmLabel: 'Remove',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.removePassengerAssignment(this.routeId(), assignment.id).subscribe({
      next: () => {
        this.toast.success('Passenger removed from route.');
        this.load();
        this.changed.emit();
      },
      error: () => this.toast.error('We could not remove this passenger.'),
    });
  }
}

/** Today as `YYYY-MM-DD`, which is what a date input and the API both expect. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
