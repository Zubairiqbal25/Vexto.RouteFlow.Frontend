import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PassengerSelfApi, VextoApiError } from '@vexto/api-client';
import type { PassengerAbsenceResponse } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxField,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate } from '@vexto/utilities';

/**
 * Telling the operator you are not travelling.
 *
 * Kept to one date and an optional reason. A passenger declaring an absence is doing something
 * small and slightly awkward; asking them to pick a route and a time band would be worse than not
 * offering the feature.
 */
@Component({
  selector: 'vexto-passenger-absences-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    VxEmptyState,
    VxErrorState,
    VxField,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    <div class="p-4">
      <h1 class="text-lg font-semibold tracking-tight text-ink">Absences</h1>
      <p class="mt-1 text-body text-ink-muted">Days you have told your operator you will not travel.</p>

      <form class="vx-card mt-5 p-5" [formGroup]="form" (ngSubmit)="submit()">
        <vx-field label="Date" for="a-date" [required]="true" [control]="form.controls.serviceDate">
          <input id="a-date" type="date" class="vx-input" formControlName="serviceDate" />
        </vx-field>

        <div class="mt-4">
          <vx-field label="Reason" for="a-reason" help="Optional.">
            <input id="a-reason" class="vx-input" formControlName="reason" />
          </vx-field>
        </div>

        <button type="submit" class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Declare absence' }}
        </button>
      </form>

      @if (loading()) {
        <div class="mt-5 flex flex-col gap-3">
          @for (row of [0, 1]; track row) {
            <vx-skeleton height="4.5rem" />
          }
        </div>
      } @else if (error(); as message) {
        <vx-error-state title="We could not load your absences" [message]="message" (retry)="load()" />
      } @else if (absences().length === 0) {
        <vx-empty-state
          icon="calendar"
          title="No absences declared"
          description="Tell your operator in advance and your seat will not be held."
        />
      } @else {
        <ul class="mt-5 flex flex-col gap-3">
          @for (absence of absences(); track absence.id) {
            <li class="vx-card flex items-center justify-between gap-3 p-4">
              <div class="min-w-0">
                <p class="font-semibold text-ink">{{ date(absence.serviceDate) }}</p>
                <p class="mt-0.5 truncate text-meta text-ink-muted">
                  {{ absence.reason || 'No reason given' }}
                </p>
              </div>
              <div class="flex flex-none items-center gap-2">
                <vx-status-badge [status]="absence.status" />
                @if (absence.status === 'Active') {
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm"
                    (click)="cancel(absence)"
                  >
                    Undo
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class PassengerAbsencesPage {
  private readonly api = inject(PassengerSelfApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly date = formatDate;

  protected readonly absences = signal<PassengerAbsenceResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    serviceDate: [tomorrow(), [Validators.required]],
    reason: [''],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.myAbsences({ includeCancelled: true }).subscribe({
      next: (absences) => {
        this.absences.set(
          [...absences].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)),
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load your absences.',
        );
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();

      return;
    }

    this.saving.set(true);

    const { serviceDate, reason } = this.form.getRawValue();

    this.api.declareAbsence({ serviceDate, routeId: null, reason: reason || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.patchValue({ reason: '' });
        this.toast.success('Absence saved.');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not save that absence.',
        );
      },
    });
  }

  protected async cancel(absence: PassengerAbsenceResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Travelling after all?',
      message: `Your seat on ${formatDate(absence.serviceDate)} will be held again.`,
      confirmLabel: 'Yes, I am travelling',
      cancelLabel: 'Keep absence',
    });

    if (!confirmed) {
      return;
    }

    this.api.cancelAbsence(absence.id).subscribe({
      next: () => {
        this.toast.success('Absence cancelled.');
        this.load();
      },
      error: () => this.toast.error('We could not cancel that absence.'),
    });
  }
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  return date.toISOString().slice(0, 10);
}
