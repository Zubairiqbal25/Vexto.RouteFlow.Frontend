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
import { DriversApi, RoutesApi, VehiclesApi, VextoApiError } from '@vexto/api-client';
import type { DriverResponse, RouteResourceAssignment, VehicleResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
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
 * The crew and vehicle a route runs with.
 *
 * Driver and vehicle are assigned together because that is how the backend models it — a route is
 * resourced as a pair, and splitting them in the UI would invent a state the API cannot express.
 */
@Component({
  selector: 'vexto-route-resources-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
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
      title="Driver and vehicle"
      description="Who runs this route, and from when."
      [padded]="false"
    >
      <button
        *vxCan="manage"
        header-actions
        type="button"
        class="vx-btn vx-btn-secondary vx-btn-sm"
        (click)="openAssign()"
      >
        <vx-icon name="plus" [size]="15" />
        Assign crew
      </button>

      @if (loading()) {
        <vx-skeleton-table [columns]="5" [rows]="3" />
      } @else if (error()) {
        <vx-error-state title="We could not load assignments" [message]="error()!" (retry)="load()" />
      } @else if (assignments().length === 0) {
        <vx-empty-state
          icon="drivers"
          title="No crew assigned"
          description="Assign a driver and vehicle so generated trips have someone to run them."
        />
      } @else {
        <div class="vx-table-scroll vx-scroll">
          <table class="vx-table">
            <thead>
              <tr>
                <th scope="col">Driver</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Effective</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (assignment of assignments(); track assignment.id) {
                <tr>
                  <td class="vx-cell-strong">{{ assignment.driverName }}</td>
                  <td>{{ assignment.vehiclePlateNumber }}</td>
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
                      [attr.aria-label]="'Remove ' + assignment.driverName"
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
      title="Assign crew"
      description="Only active drivers and vehicles can be assigned."
      (closed)="formOpen.set(false)"
    >
      <form [formGroup]="form" (ngSubmit)="save()" id="assign-resources-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Crew">
          <vx-field
            label="Driver"
            for="res-driver"
            [required]="true"
            [wide]="true"
            [control]="form.controls.driverId"
          >
            <select id="res-driver" class="vx-select" formControlName="driverId">
              <option value="">Select a driver</option>
              @for (driver of drivers(); track driver.id) {
                <option [value]="driver.id">
                  {{ driver.firstName }} {{ driver.lastName }} · {{ driver.licenseNumber }}
                </option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Vehicle"
            for="res-vehicle"
            [required]="true"
            [wide]="true"
            [control]="form.controls.vehicleId"
          >
            <select id="res-vehicle" class="vx-select" formControlName="vehicleId">
              <option value="">Select a vehicle</option>
              @for (vehicle of vehicles(); track vehicle.id) {
                <option [value]="vehicle.id">
                  {{ vehicle.plateNumber }} · {{ vehicle.capacity }} seats
                </option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Effective from"
            for="res-from"
            [required]="true"
            [control]="form.controls.effectiveFrom"
          >
            <input id="res-from" type="date" class="vx-input" formControlName="effectiveFrom" />
          </vx-field>

          <vx-field label="Effective to" for="res-to" help="Leave empty for an ongoing assignment.">
            <input id="res-to" type="date" class="vx-input" formControlName="effectiveTo" />
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
        form="assign-resources-form"
        class="vx-btn vx-btn-primary"
        [disabled]="saving()"
      >
        {{ saving() ? 'Assigning…' : 'Assign crew' }}
      </button>
    </vx-modal>
  `,
})
export class RouteResourcesTab {
  private readonly api = inject(RoutesApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly routeId = input.required<string>();
  readonly changed = output<void>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly date = formatDate;

  protected readonly assignments = signal<RouteResourceAssignment[]>([]);
  protected readonly drivers = signal<DriverResponse[]>([]);
  protected readonly vehicles = signal<VehicleResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    driverId: ['', [Validators.required]],
    vehicleId: ['', [Validators.required]],
    effectiveFrom: [new Date().toISOString().slice(0, 10), [Validators.required]],
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

    this.api.resources(this.routeId()).subscribe({
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
  }

  protected openAssign(): void {
    this.formError.set(null);
    this.form.reset({
      driverId: '',
      vehicleId: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
    });
    this.formOpen.set(true);

    this.driversApi.list({ status: 'Active', pageSize: 100 }).subscribe({
      next: (result) => this.drivers.set(result.items),
      error: () => this.toast.error('We could not load the driver list.'),
    });

    this.vehiclesApi.list({ status: 'Active', pageSize: 100 }).subscribe({
      next: (result) => this.vehicles.set(result.items),
      error: () => this.toast.error('We could not load the vehicle list.'),
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
      .assignResources(this.routeId(), {
        driverId: value.driverId,
        vehicleId: value.vehicleId,
        effectiveFrom: value.effectiveFrom,
        effectiveTo: value.effectiveTo || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.toast.success('Crew assigned to route.');
          this.load();
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            error instanceof VextoApiError ? error.message : 'We could not assign this crew.',
          );
        },
      });
  }

  protected async remove(assignment: RouteResourceAssignment): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove crew assignment?',
      message: `${assignment.driverName} and ${assignment.vehiclePlateNumber} will no longer be the default for this route.`,
      confirmLabel: 'Remove',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.removeResourceAssignment(this.routeId(), assignment.id).subscribe({
      next: () => {
        this.toast.success('Assignment removed.');
        this.load();
        this.changed.emit();
      },
      error: () => this.toast.error('We could not remove this assignment.'),
    });
  }
}
