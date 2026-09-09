import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import type { ApiDayOfWeek, RouteSchedule } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxField,
  VxFormSection,
  VxIcon,
  VxModal,
  VxSectionCard,
} from '@vexto/ui';
import { formatDate, serviceDate } from '@vexto/utilities';
import { RouteWorkspaceStore } from './route-workspace.store';

/** UAE working week order: Monday to Friday first, then the weekend. */
const DAYS: readonly ApiDayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * The recurring pattern a route runs to.
 *
 * Cards rather than table rows: a weekly schedule is at most seven short facts, and a table of
 * seven rows and five columns spends four hundred pixels of vertical space saying "Monday 06:00".
 * The chips read as a week, which is the shape of the thing.
 *
 * Trip generation is no longer buried at the bottom of this tab — it is the route workspace's
 * primary action, because it is the one thing that turns all this configuration into a journey.
 */
@Component({
  selector: 'vexto-route-schedule-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    VxEmptyState,
    VxField,
    VxFormSection,
    VxIcon,
    VxModal,
    VxSectionCard,
  ],
  template: `
    <vx-section-card
      title="Weekly schedule"
      description="The days and times this route departs. Trips are generated from these."
    >
      <button
        *vxCan="manage"
        header-actions
        type="button"
        class="vx-btn vx-btn-secondary vx-btn-sm"
        (click)="openForm()"
      >
        <vx-icon name="plus" [size]="15" />
        Add schedule
      </button>

      @if (schedules().length === 0) {
        <vx-empty-state
          icon="calendar"
          title="No schedule yet"
          description="Add the days this route runs. Without a schedule there is nothing to generate trips from."
          [actionLabel]="canManage() ? 'Add schedule' : null"
          (action)="openForm()"
        />
      } @else {
        <div class="flex flex-wrap gap-3">
          @for (schedule of schedules(); track schedule.id) {
            <div
              class="vx-card flex min-w-[9.5rem] flex-col gap-1 p-3.5"
              [class.opacity-60]="!schedule.isActive"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="vx-section-label">{{ schedule.dayOfWeek.slice(0, 3) }}</p>
                  <p class="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-ink">
                    {{ schedule.startTime.slice(0, 5) }}
                  </p>
                </div>
                @if (canManage()) {
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Remove the ' + schedule.dayOfWeek + ' departure'"
                    (click)="remove(schedule)"
                  >
                    <vx-icon name="trash" [size]="15" />
                  </button>
                }
              </div>

              <p class="text-meta text-ink-muted">
                @if (schedule.effectiveTo) {
                  {{ date(schedule.effectiveFrom) }} → {{ date(schedule.effectiveTo) }}
                } @else {
                  From {{ date(schedule.effectiveFrom) }}
                }
              </p>

              @if (!schedule.isActive) {
                <p class="text-meta font-medium" style="color: var(--vexto-text-muted)">Inactive</p>
              }
            </div>
          }
        </div>
      }
    </vx-section-card>

    <vx-modal
      [open]="formOpen()"
      [dismissable]="!saving()"
      title="Add schedule"
      description="One entry per day the route departs."
      (closed)="formOpen.set(false)"
    >
      <form [formGroup]="form" (ngSubmit)="save()" id="schedule-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Departure">
          <vx-field label="Day" for="sc-day" [required]="true">
            <select id="sc-day" class="vx-select" formControlName="dayOfWeek">
              @for (day of days; track day) {
                <option [value]="day">{{ day }}</option>
              }
            </select>
          </vx-field>

          <vx-field
            label="Start time"
            for="sc-time"
            [required]="true"
            [control]="form.controls.startTime"
          >
            <input id="sc-time" type="time" class="vx-input" formControlName="startTime" />
          </vx-field>

          <vx-field
            label="Effective from"
            for="sc-from"
            [required]="true"
            [control]="form.controls.effectiveFrom"
          >
            <input id="sc-from" type="date" class="vx-input" formControlName="effectiveFrom" />
          </vx-field>

          <vx-field label="Effective to" for="sc-to" help="Leave empty to run indefinitely.">
            <input id="sc-to" type="date" class="vx-input" formControlName="effectiveTo" />
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
        form="schedule-form"
        (click)="save()"
        class="vx-btn vx-btn-primary"
        [disabled]="saving()"
      >
        {{ saving() ? 'Saving…' : 'Add schedule' }}
      </button>
    </vx-modal>
  `,
})
export class RouteScheduleTab {
  private readonly api = inject(RoutesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);
  private readonly store = inject(RouteWorkspaceStore);

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly days = DAYS;
  protected readonly date = formatDate;

  protected readonly schedules = this.store.schedules;
  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Routes.Manage),
  );

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    dayOfWeek: ['Monday', [Validators.required]],
    startTime: ['06:15', [Validators.required]],
    effectiveFrom: [isoDate(0), [Validators.required]],
    effectiveTo: [''],
  });

  protected openForm(): void {
    this.formError.set(null);
    this.form.reset({
      dayOfWeek: 'Monday',
      startTime: '06:15',
      effectiveFrom: isoDate(0),
      effectiveTo: '',
    });
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

    this.api
      .addSchedule(this.routeId(), {
        dayOfWeek: value.dayOfWeek as ApiDayOfWeek,
        startTime: `${value.startTime}:00`,
        effectiveFrom: value.effectiveFrom,
        effectiveTo: value.effectiveTo || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.toast.success('Schedule added.');
          this.afterChange();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(
            error instanceof VextoApiError ? error.message : 'We could not save this schedule.',
          );
        },
      });
  }

  protected async remove(schedule: RouteSchedule): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove schedule?',
      message: `This route will no longer generate trips for ${schedule.dayOfWeek}. Trips already created are kept.`,
      confirmLabel: 'Remove',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.removeSchedule(this.routeId(), schedule.id).subscribe({
      next: () => {
        this.toast.success('Schedule removed.');
        this.afterChange();
      },
      error: () => this.toast.error('We could not remove this schedule.'),
    });
  }

  private routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }

  private afterChange(): void {
    this.store.refreshSchedules();
    this.store.refreshDetail();
  }
}

/** An ISO date `days` from today. */
function isoDate(days: number): string {
  return serviceDate(days);
}
