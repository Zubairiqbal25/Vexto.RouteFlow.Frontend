import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DriversApi, RoutesApi, VehiclesApi, VextoApiError } from '@vexto/api-client';
import type { RouteResourceAssignment } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAttentionNote,
  VxAvatar,
  VxCardFact,
  VxDrawer,
  VxEmptyState,
  VxField,
  VxIcon,
  VxPicker,
  type VxPickerOption,
  VxSectionCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, serviceDate } from '@vexto/utilities';
import { RouteWorkspaceStore } from './route-workspace.store';

/**
 * The crew and vehicle a route runs with.
 *
 * Driver and vehicle are assigned together because that is how the backend models it — a route is
 * resourced as a pair, and splitting them in the UI would invent a state the API cannot express.
 * The two "Change" buttons open the same drawer, focused on the half that was pressed.
 *
 * **The capacity check is shown before the confirmation, not after the refusal.** The API will
 * reject a 24-seat bus for 26 passengers with a readable reason, and that reason is still displayed
 * verbatim if it arrives — but a dispatcher choosing a vehicle from a list should be able to see the
 * problem while they are still choosing, rather than discovering it from a red toast.
 */
@Component({
  selector: 'vexto-route-resources-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    VxAttentionNote,
    VxAvatar,
    VxCardFact,
    VxDrawer,
    VxEmptyState,
    VxField,
    VxIcon,
    VxPicker,
    VxSectionCard,
    VxStatusBadge,
  ],
  template: `
    <vx-section-card
      title="Driver and vehicle"
      description="Who runs this route, and from when."
    >
      <button
        *vxCan="manage"
        header-actions
        type="button"
        class="vx-btn vx-btn-secondary vx-btn-sm"
        (click)="open()"
      >
        <vx-icon name="plus" [size]="15" />
        Assign crew
      </button>

      @if (assignments().length === 0) {
        <vx-empty-state
          icon="drivers"
          title="No crew assigned"
          description="Assign a driver and vehicle so generated trips have someone to run them."
          [actionLabel]="canManage() ? 'Assign crew' : null"
          (action)="open()"
        />
      } @else {
        <ul class="flex flex-col gap-3">
          @for (assignment of assignments(); track assignment.id) {
            <li
              class="vx-card flex flex-wrap items-center justify-between gap-4 p-4"
              [class.opacity-60]="assignment.status !== 'Active'"
            >
              <div class="flex min-w-0 items-center gap-3">
                <vx-avatar size="md" [name]="assignment.driverName" />
                <div class="min-w-0">
                  <p class="truncate font-semibold text-ink">{{ assignment.driverName }}</p>
                  <p class="mt-0.5 flex items-center gap-1.5 text-meta text-ink-muted">
                    <vx-icon name="vehicle" [size]="14" />
                    {{ assignment.vehiclePlateNumber }}
                  </p>
                </div>
              </div>

              <dl class="flex flex-wrap items-center gap-x-8 gap-y-2">
                <vx-card-fact label="Effective" [value]="effective(assignment)" />
                <div>
                  <p class="vx-section-label">Status</p>
                  <div class="mt-0.5"><vx-status-badge [status]="assignment.status" /></div>
                </div>
              </dl>

              @if (canManage()) {
                <div class="flex flex-none items-center gap-2">
                  <button type="button" class="vx-btn vx-btn-secondary vx-btn-sm" (click)="open()">
                    Change
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Remove ' + assignment.driverName"
                    (click)="remove(assignment)"
                  >
                    <vx-icon name="trash" [size]="16" />
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </vx-section-card>

    <vx-drawer
      [open]="drawerOpen()"
      title="Assign crew"
      subtitle="Only active drivers and roadworthy vehicles are offered."
      (closed)="drawerOpen.set(false)"
    >
      <form [formGroup]="form" class="flex flex-col gap-5">
        @if (formError(); as message) {
          <p
            class="rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <div>
          <p class="vx-section-label">Current driver</p>
          <p class="mt-1 text-body font-medium text-ink">
            {{ current()?.driverName ?? 'Nobody assigned' }}
          </p>
        </div>

        <vx-field
          label="New driver"
          for="res-driver"
          [required]="true"
          [wide]="true"
          [control]="form.controls.driverId"
        >
          <!--
            A searchable picker, not a dropdown. A plain select here held only the first fifty
            drivers the server returned, so on a real roster the rest could not be chosen at all and
            nothing on screen said so. See VxPicker.
          -->
          <vx-picker
            inputId="res-driver"
            placeholder="Search drivers…"
            emptyLabel="No drivers are available to roster."
            [limit]="20"
            [search]="searchDrivers"
            [selected]="driver()"
            [disabled]="saving()"
            (chosen)="onDriverChosen($event)"
          />
        </vx-field>

        <div>
          <p class="vx-section-label">Current vehicle</p>
          <p class="mt-1 text-body font-medium text-ink">
            {{ current()?.vehiclePlateNumber ?? 'Nothing assigned' }}
          </p>
        </div>

        <vx-field
          label="New vehicle"
          for="res-vehicle"
          [required]="true"
          [wide]="true"
          [control]="form.controls.vehicleId"
        >
          <vx-picker
            inputId="res-vehicle"
            placeholder="Search by plate or model…"
            emptyLabel="No vehicles are in service."
            [limit]="20"
            [search]="searchVehicles"
            [selected]="vehicle()"
            [disabled]="saving()"
            (chosen)="onVehicleChosen($event)"
          />
        </vx-field>

        <!--
          The picker's secondary label carries the seat count, so the comparison can be made from
          data already on screen rather than by fetching each vehicle to read its capacity.
        -->
        <div class="rounded-xl p-3.5" style="background: var(--vexto-surface-muted)">
          <dl class="grid grid-cols-2 gap-3">
            <vx-card-fact label="Vehicle capacity" [value]="chosenCapacity() ?? '—'" />
            <vx-card-fact label="Assigned passengers" [value]="passengerCount()" />
          </dl>
          @if (capacityShortfall()) {
            <div class="mt-3">
              <vx-attention-note level="critical">
                Vehicle capacity is insufficient — {{ passengerCount() }} passengers are assigned to
                this route.
              </vx-attention-note>
            </div>
          }
        </div>

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
      </form>

      <div footer class="flex justify-end gap-2">
        <button
          type="button"
          class="vx-btn vx-btn-secondary"
          [disabled]="saving()"
          (click)="drawerOpen.set(false)"
        >
          Cancel
        </button>
        <button type="button" class="vx-btn vx-btn-primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Assigning…' : 'Confirm assignment' }}
        </button>
      </div>
    </vx-drawer>
  `,
})
export class RouteResourcesTab {
  private readonly api = inject(RoutesApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(RouteWorkspaceStore);

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly date = formatDate;

  protected readonly assignments = this.store.resources;
  protected readonly current = this.store.currentResource;
  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Routes.Manage),
  );
  protected readonly passengerCount = computed(() =>
    Number(this.store.detail()?.summary.activePassengerCount ?? 0),
  );

  protected readonly driver = signal<VxPickerOption | null>(null);
  protected readonly vehicle = signal<VxPickerOption | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /**
   * Stable references, so the picker's required input does not change identity on every change
   * detection run and restart the search stream.
   */
  protected readonly searchDrivers = (term: string) =>
    this.driversApi.picker({ search: term || undefined });

  protected readonly searchVehicles = (term: string) =>
    this.vehiclesApi.picker({ search: term || undefined });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    driverId: ['', [Validators.required]],
    vehicleId: ['', [Validators.required]],
    effectiveFrom: [serviceDate(), [Validators.required]],
    effectiveTo: [''],
  });

  /** Seats, read out of the picker's secondary label ("Mini Bus · 24 seats"). */
  protected readonly chosenCapacity = computed(() => {
    const seats = this.vehicle()?.secondaryLabel?.match(/(\d+)\s*seat/iu)?.[1];

    return seats ? Number(seats) : null;
  });

  protected readonly capacityShortfall = computed(() => {
    const capacity = this.chosenCapacity();

    return capacity !== null && capacity < this.passengerCount();
  });

  protected onDriverChosen(option: VxPickerOption | null): void {
    this.driver.set(option);
    this.form.controls.driverId.setValue(option?.id ?? '');
    this.form.controls.driverId.markAsTouched();
  }

  protected onVehicleChosen(option: VxPickerOption | null): void {
    this.vehicle.set(option);
    this.form.controls.vehicleId.setValue(option?.id ?? '');
    this.form.controls.vehicleId.markAsTouched();
  }

  protected effective(assignment: RouteResourceAssignment): string {
    return assignment.effectiveTo
      ? `${this.date(assignment.effectiveFrom)} → ${this.date(assignment.effectiveTo)}`
      : `From ${this.date(assignment.effectiveFrom)}`;
  }

  protected open(): void {
    const current = this.current();

    this.formError.set(null);
    this.form.reset({
      driverId: current?.driverId ?? '',
      vehicleId: current?.vehicleId ?? '',
      effectiveFrom: serviceDate(),
      effectiveTo: '',
    });
    // Pre-selected from the current roster, so the picker shows a label rather than an id. The
    // options themselves are not fetched until the field is opened: most visits to this tab change
    // nothing.
    this.driver.set(
      current?.driverId
        ? { id: current.driverId, label: current.driverName ?? 'Current driver', secondaryLabel: null }
        : null,
    );
    this.vehicle.set(
      current?.vehicleId
        ? {
            id: current.vehicleId,
            label: current.vehiclePlateNumber ?? 'Current vehicle',
            secondaryLabel: null,
          }
        : null,
    );

    // One lookup for the rostered bus, so the capacity comparison below has a number to compare
    // against before anything is chosen. See the same call in the trip crew drawer.
    if (current?.vehiclePlateNumber) {
      this.vehiclesApi.picker({ search: current.vehiclePlateNumber }).subscribe({
        next: (options) => {
          const match = options.find((option) => option.id === current.vehicleId);

          if (match) {
            this.vehicle.set(match);
          }
        },
        error: () => undefined,
      });
    }

    this.drawerOpen.set(true);
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
          this.drawerOpen.set(false);
          this.toast.success('Crew assigned to route.');
          this.afterChange();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          // The API's own reason — suspended driver, bus in the workshop, dates overlapping an
          // existing assignment — is shown rather than replaced with something generic.
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
        this.afterChange();
      },
      error: () => this.toast.error('We could not remove this assignment.'),
    });
  }

  private routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }

  private afterChange(): void {
    this.store.refreshResources();
    this.store.refreshDetail();
  }
}
