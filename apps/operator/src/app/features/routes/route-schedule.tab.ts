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
import type { ApiDayOfWeek, RouteSchedule } from '@vexto/models';
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
 * The recurring pattern a route runs to, and the button that turns it into real trips.
 *
 * Trip generation is explicit rather than automatic: a dispatcher chooses the window, sees how many
 * trips were created and how many already existed, and nothing appears in the operation without
 * someone asking for it.
 */
@Component({
  selector: 'vexto-route-schedule-tab',
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
      title="Weekly schedule"
      description="The days and times this route departs."
      [padded]="false"
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

      @if (loading()) {
        <vx-skeleton-table [columns]="4" [rows]="3" />
      } @else if (error()) {
        <vx-error-state title="We could not load the schedule" [message]="error()!" (retry)="load()" />
      } @else if (schedules().length === 0) {
        <vx-empty-state
          icon="calendar"
          title="No schedule yet"
          description="Add the days this route runs before generating trips."
        />
      } @else {
        <div class="vx-table-scroll vx-scroll">
          <table class="vx-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Departs</th>
                <th scope="col">Effective</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (schedule of schedules(); track schedule.id) {
                <tr>
                  <td class="vx-cell-strong">{{ schedule.dayOfWeek }}</td>
                  <td>{{ schedule.startTime.slice(0, 5) }}</td>
                  <td>
                    {{ date(schedule.effectiveFrom) }}
                    @if (schedule.effectiveTo) {
                      <span class="text-ink-muted"> → {{ date(schedule.effectiveTo) }}</span>
                    }
                  </td>
                  <td>
                    <vx-status-badge
                      [tone]="schedule.isActive ? 'success' : 'neutral'"
                      [label]="schedule.isActive ? 'Active' : 'Inactive'"
                    />
                  </td>
                  <td class="text-end">
                    <button
                      *vxCan="manage"
                      type="button"
                      class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                      [attr.aria-label]="'Remove ' + schedule.dayOfWeek + ' schedule'"
                      (click)="remove(schedule)"
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

    <div *vxCan="generate" class="mt-6">
      <vx-section-card
        title="Generate trips"
        description="Creates trips from this schedule for a date range. Dates that already have a trip are skipped."
      >
        <form class="flex flex-wrap items-end gap-4" [formGroup]="generateForm" (ngSubmit)="run()">
          <vx-field label="From" for="g-from">
            <input id="g-from" type="date" class="vx-input" formControlName="fromDate" />
          </vx-field>
          <vx-field label="To" for="g-to">
            <input id="g-to" type="date" class="vx-input" formControlName="toDate" />
          </vx-field>
          <!--
            Wired to (click) as well as the form's (ngSubmit). Clicking a submit button in this app
            does not raise the form's submit event — the same reason every drawer's save button is
            wired directly — so relying on implicit submission alone leaves the button inert.
          -->
          <button
            type="submit"
            class="vx-btn vx-btn-primary"
            [disabled]="generating()"
            (click)="run()"
          >
            <vx-icon name="trips" [size]="16" />
            {{ generating() ? 'Generating…' : 'Generate Trips' }}
          </button>
        </form>

        @if (generateResult(); as result) {
          <p class="mt-4 text-body text-ink-secondary" role="status">
            Created <span class="font-semibold text-ink">{{ result.created }}</span> trips, skipped
            <span class="font-semibold text-ink">{{ result.skipped }}</span> that already existed.
          </p>
        }
      </vx-section-card>
    </div>

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
  private readonly builder = inject(FormBuilder);

  readonly routeId = input.required<string>();
  readonly changed = output<void>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly generate = VextoPermissions.Trips.Manage;
  protected readonly days = DAYS;
  protected readonly date = formatDate;

  protected readonly schedules = signal<RouteSchedule[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly generating = signal(false);
  protected readonly generateResult = signal<{ created: number; skipped: number } | null>(null);

  protected readonly form = this.builder.nonNullable.group({
    dayOfWeek: ['Monday', [Validators.required]],
    startTime: ['06:15', [Validators.required]],
    effectiveFrom: [isoDate(0), [Validators.required]],
    effectiveTo: [''],
  });

  protected readonly generateForm = this.builder.nonNullable.group({
    fromDate: [isoDate(0), [Validators.required]],
    // A fortnight is a sensible default: long enough to be useful, short enough to review.
    toDate: [isoDate(14), [Validators.required]],
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

    this.api.schedules(this.routeId()).subscribe({
      next: (schedules) => {
        this.schedules.set(schedules);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load the schedule.',
        );
      },
    });
  }

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
          this.load();
          this.changed.emit();
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
        this.load();
        this.changed.emit();
      },
      error: () => this.toast.error('We could not remove this schedule.'),
    });
  }

  protected run(): void {
    if (this.generateForm.invalid || this.generating()) {
      return;
    }

    this.generating.set(true);
    this.generateResult.set(null);

    const { fromDate, toDate } = this.generateForm.getRawValue();

    this.api.generateTrips(this.routeId(), { fromDate, toDate }).subscribe({
      next: (result) => {
        this.generating.set(false);
        this.generateResult.set({ created: result.created, skipped: result.skipped });
        this.toast.success(`${result.created} trips generated.`);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.generating.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not generate trips.',
        );
      },
    });
  }
}

/** An ISO date `days` from today. */
function isoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}
