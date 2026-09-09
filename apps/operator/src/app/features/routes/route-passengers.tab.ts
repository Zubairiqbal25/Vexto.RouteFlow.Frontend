import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PassengersApi, RoutesApi, VextoApiError } from '@vexto/api-client';
import type { RouteAssignmentType, RoutePassengerAssignment } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  type VxCardAction,
  VxAvatar,
  VxCardFact,
  VxCardGrid,
  VxEmptyState,
  VxEntityCard,
  VxField,
  VxFormSection,
  VxIcon,
  VxModal,
  VxPicker,
  type VxPickerOption,
  VxSectionCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, serviceDate } from '@vexto/utilities';
import { RouteWorkspaceStore } from './route-workspace.store';

/**
 * Who travels on this route, as operational cards rather than a table.
 *
 * The question here is never "sort forty people by effective date" — it is "who gets on at stop 2,
 * and is anyone on this route not currently allowed to travel". Cards put the face, the stop and
 * the state on one line each; a table put them behind five columns of equal weight.
 *
 * **A withdrawn or suspended assignment stays visible**, dimmed and labelled. Hiding it would leave
 * an operator wondering why a passenger they assigned last week is not on the manifest.
 *
 * No money appears here. Whether somebody owes a fare is a billing question, on a billing screen,
 * behind a billing permission — the route planner's job is seats and stops.
 */
@Component({
  selector: 'vexto-route-passengers-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    VxAvatar,
    VxCardFact,
    VxCardGrid,
    VxEmptyState,
    VxEntityCard,
    VxField,
    VxFormSection,
    VxIcon,
    VxModal,
    VxPicker,
    VxSectionCard,
    VxStatusBadge,
  ],
  template: `
    <vx-section-card
      title="Passengers"
      description="People assigned to this route and the stop they are collected from."
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

      @if (assignments().length === 0) {
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
        <vx-card-grid [dense]="true">
          @for (assignment of assignments(); track assignment.id) {
            <vx-entity-card
              [title]="assignment.passengerName"
              [subtitle]="assignment.assignmentType + ' assignment'"
              [muted]="assignment.status !== 'Active'"
              [actions]="cardActions()"
              (opened)="view(assignment)"
              (action)="onAction($event, assignment)"
            >
              <vx-avatar media size="md" [name]="assignment.passengerName" />
              <vx-status-badge status [status]="assignment.status" />

              <dl class="mt-3 grid grid-cols-2 gap-3">
                <vx-card-fact label="Pickup" [value]="stopLabel(assignment)" />
                <vx-card-fact label="Effective" [value]="effective(assignment)" />
              </dl>
            </vx-entity-card>
          }
        </vx-card-grid>
      }
    </vx-section-card>

    <vx-modal
      [open]="formOpen()"
      [dismissable]="!saving()"
      [title]="editing() ? 'Change pickup stop' : 'Assign passenger'"
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
          @if (!editing()) {
            <!--
              A searchable picker, not a dropdown. The picker endpoint returns at most fifty rows,
              so on an operator with more passengers than that the person being assigned simply was
              not in the list — and the list gave no sign it had ended. See VxPicker.
            -->
            <vx-field
              label="Passenger"
              for="a-passenger"
              [required]="true"
              [wide]="true"
              [control]="form.controls.passengerId"
            >
              <vx-picker
                inputId="a-passenger"
                placeholder="Search by name or mobile"
                emptyLabel="No active passengers to assign."
                [limit]="50"
                [search]="searchPassengers"
                [selected]="chosenPassenger()"
                (chosen)="onPassengerChosen($event)"
              />
            </vx-field>
          }

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
        {{ saving() ? 'Saving…' : editing() ? 'Save changes' : 'Assign passenger' }}
      </button>
    </vx-modal>
  `,
})
export class RoutePassengersTab {
  private readonly api = inject(RoutesApi);
  private readonly passengersApi = inject(PassengersApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(RouteWorkspaceStore);

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly date = formatDate;

  protected readonly assignments = this.store.passengers;
  protected readonly stops = this.store.stops;

  /** The chosen passenger, kept whole so the picker shows a name rather than an id. */
  protected readonly chosenPassenger = signal<VxPickerOption | null>(null);

  /**
   * How the picker asks the server.
   *
   * A field rather than a method so the reference is stable — an arrow function rebuilt on every
   * change detection would restart the picker's search pipeline underneath the user.
   */
  protected readonly searchPassengers = (term: string) =>
    this.passengersApi.picker({ search: term || undefined, pageSize: 50 });
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RoutePassengerAssignment | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** Actions are the same for every card, so the array is computed once rather than per row. */
  protected readonly cardActions = computed<readonly VxCardAction[]>(() => {
    const actions: VxCardAction[] = [{ id: 'view', label: 'View passenger', icon: 'eye' }];

    if (this.permissions.has(VextoPermissions.Routes.Manage)) {
      actions.push(
        { id: 'change-pickup', label: 'Change pickup', icon: 'map-pin' },
        { id: 'remove', label: 'Remove from route', icon: 'trash', danger: true },
      );
    }

    return actions;
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    passengerId: ['', [Validators.required]],
    routeStopId: ['', [Validators.required]],
    assignmentType: ['Regular', [Validators.required]],
    effectiveFrom: [today(), [Validators.required]],
    effectiveTo: [''],
  });

  protected stopLabel(assignment: RoutePassengerAssignment): string {
    const stop = this.stops().find((candidate) => candidate.id === assignment.routeStopId);

    return stop
      ? `${String(Number(stop.sequence)).padStart(2, '0')} — ${stop.name}`
      : assignment.stopName;
  }

  protected effective(assignment: RoutePassengerAssignment): string {
    return assignment.effectiveTo
      ? `${this.date(assignment.effectiveFrom)} → ${this.date(assignment.effectiveTo)}`
      : `From ${this.date(assignment.effectiveFrom)}`;
  }

  protected onAction(action: string, assignment: RoutePassengerAssignment): void {
    if (action === 'view') {
      this.view(assignment);
    } else if (action === 'change-pickup') {
      this.changePickup(assignment);
    } else if (action === 'remove') {
      void this.remove(assignment);
    }
  }

  protected view(assignment: RoutePassengerAssignment): void {
    void this.router.navigate(['/passengers'], { queryParams: { id: assignment.passengerId } });
  }

  protected openAssign(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({
      passengerId: '',
      routeStopId: '',
      assignmentType: 'Regular',
      effectiveFrom: today(),
      effectiveTo: '',
    });
    this.form.controls.passengerId.enable();
    this.chosenPassenger.set(null);
    this.formOpen.set(true);
  }

  protected onPassengerChosen(option: VxPickerOption | null): void {
    this.chosenPassenger.set(option);
    this.form.controls.passengerId.setValue(option?.id ?? '');
    this.form.controls.passengerId.markAsDirty();
  }

  protected changePickup(assignment: RoutePassengerAssignment): void {
    this.editing.set(assignment);
    this.formError.set(null);
    this.form.reset({
      passengerId: assignment.passengerId,
      routeStopId: assignment.routeStopId,
      assignmentType: assignment.assignmentType,
      effectiveFrom: assignment.effectiveFrom,
      effectiveTo: assignment.effectiveTo ?? '',
    });
    this.form.controls.passengerId.disable();
    this.formOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();

      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const value = this.form.getRawValue();
    const existing = this.editing();
    const routeId = this.routeId();

    const request = existing
      ? this.api.updatePassengerAssignment(routeId, existing.id, {
          routeStopId: value.routeStopId,
          assignmentType: value.assignmentType as RouteAssignmentType,
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo || null,
        })
      : this.api.assignPassenger(routeId, {
          passengerId: value.passengerId,
          routeStopId: value.routeStopId,
          assignmentType: value.assignmentType as RouteAssignmentType,
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo || null,
        });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Pickup stop changed.' : 'Passenger assigned.');
        this.afterChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(
          error instanceof VextoApiError ? error.message : 'We could not save this assignment.',
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
        this.afterChange();
      },
      error: () => this.toast.error('We could not remove this passenger.'),
    });
  }

  private routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }

  /** The counts on the timeline and the capacity warning both move when an assignment changes. */
  private afterChange(): void {
    this.store.refreshPassengers();
    this.store.refreshDetail();
  }
}

/** Today as `YYYY-MM-DD`, which is what a date input and the API both expect. */
function today(): string {
  return serviceDate();
}
