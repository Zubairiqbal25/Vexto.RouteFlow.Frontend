import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { serviceDate } from '@vexto/utilities';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import { ToastService, VxAttentionNote, VxDrawer, VxField } from '@vexto/ui';
import { RouteWorkspaceStore } from './route-workspace.store';

/**
 * Turning a schedule into real journeys.
 *
 * This is the route workspace's primary action, so it is a drawer opened from the header rather
 * than a form at the bottom of a tab nobody scrolled to. Generation stays explicit: a dispatcher
 * chooses the window and is told how many trips were created and how many already existed, so
 * nothing appears in the operation without somebody asking for it.
 *
 * The readiness gaps are repeated here because this is the moment they matter. The button is still
 * enabled when the route is only *warned* about — an unassigned driver produces a trip a dispatcher
 * can crew later, and refusing to generate it would be the UI overruling a rule the API does not
 * have.
 */
@Component({
  selector: 'vexto-generate-trips-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxAttentionNote, VxDrawer, VxField],
  template: `
    <vx-drawer
      [open]="open()"
      title="Generate trips"
      subtitle="Creates one trip per scheduled departure in the range."
      (closed)="dismissed.emit()"
    >
      <div class="flex flex-col gap-5">
        @if (blocking().length > 0) {
          <div class="flex flex-col gap-2">
            @for (gap of blocking(); track gap.id) {
              <vx-attention-note [level]="gap.level">
                <span class="font-semibold">{{ gap.label }}</span>
                <span class="font-normal">— {{ gap.detail }}</span>
              </vx-attention-note>
            }
          </div>
        }

        <form [formGroup]="form" class="grid gap-4 sm:grid-cols-2">
          <vx-field label="From" for="g-from" [required]="true" [control]="form.controls.fromDate">
            <input id="g-from" type="date" class="vx-input" formControlName="fromDate" />
          </vx-field>
          <vx-field label="To" for="g-to" [required]="true" [control]="form.controls.toDate">
            <input id="g-to" type="date" class="vx-input" formControlName="toDate" />
          </vx-field>
        </form>

        <p class="text-meta text-ink-muted">
          Dates that already have a trip for this route are skipped, so running this twice over the
          same range is safe.
        </p>

        @if (result(); as outcome) {
          <p
            class="rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-success-soft); color: var(--vexto-success-text)"
            role="status"
          >
            Created <span class="font-semibold">{{ outcome.created }}</span> trips, skipped
            <span class="font-semibold">{{ outcome.skipped }}</span> that already existed.
          </p>
        }
      </div>

      <div footer class="flex justify-end gap-2">
        <button
          type="button"
          class="vx-btn vx-btn-secondary"
          [disabled]="generating()"
          (click)="dismissed.emit()"
        >
          Close
        </button>
        <button
          type="button"
          class="vx-btn vx-btn-primary"
          [disabled]="generating() || form.invalid"
          (click)="run()"
        >
          {{ generating() ? 'Generating…' : 'Generate trips' }}
        </button>
      </div>
    </vx-drawer>
  `,
})
export class GenerateTripsDrawer {
  private readonly api = inject(RoutesApi);
  private readonly toast = inject(ToastService);
  private readonly store = inject(RouteWorkspaceStore);

  readonly open = input(false);
  readonly dismissed = output<void>();
  readonly generated = output<void>();

  protected readonly generating = signal(false);
  protected readonly result = signal<{ created: number; skipped: number } | null>(null);

  /** Capacity is not repeated here: it does not stop a trip being generated, only crewed. */
  protected readonly blocking = computed(() =>
    this.store.gaps().filter((gap) => gap.id !== 'capacity'),
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    fromDate: [isoDate(0), [Validators.required]],
    // A fortnight is long enough to be useful and short enough to review before confirming.
    toDate: [isoDate(14), [Validators.required]],
  });

  protected run(): void {
    if (this.form.invalid || this.generating()) {
      return;
    }

    this.generating.set(true);
    this.result.set(null);

    const { fromDate, toDate } = this.form.getRawValue();

    this.api.generateTrips(this.routeId(), { fromDate, toDate }).subscribe({
      next: (outcome) => {
        this.generating.set(false);
        this.result.set({ created: Number(outcome.created), skipped: Number(outcome.skipped) });
        this.toast.success(`${outcome.created} trips generated.`);
        this.generated.emit();
      },
      error: (error: unknown) => {
        this.generating.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not generate trips.',
        );
      },
    });
  }

  private routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }
}

/** An ISO date `days` from today. */
function isoDate(days: number): string {
  return serviceDate(days);
}
