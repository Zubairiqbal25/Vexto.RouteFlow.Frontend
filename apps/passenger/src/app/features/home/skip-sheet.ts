import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { PassengerSelfApi, VextoApiError } from '@vexto/api-client';
import type { PassengerTrip } from '@vexto/models';
import { ToastService, VxDrawer, VxIcon } from '@vexto/ui';
import { formatDayLabel, formatTime } from '@vexto/utilities';

/**
 * Telling the operator you are not travelling.
 *
 * **The shape of this sheet depends on how many trips there actually are.** Somebody with one
 * morning bus should confirm and be done; somebody with a morning and an evening trip must be able
 * to skip the morning and still ride home, and a single "Skip tomorrow" button would silently take
 * both. So one trip gets a confirmation, several get checkboxes, and nothing is assumed.
 *
 * The absence API takes a service date and an optional route, which is exactly this: one call per
 * chosen route, or one call with no route when the passenger is skipping the whole day. Nothing is
 * invented on the client — the response says how many trips it actually affected, and that is the
 * number reported back.
 */
@Component({
  selector: 'vexto-skip-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxDrawer, VxIcon],
  template: `
    <vx-drawer
      [open]="open()"
      title="Not travelling?"
      [subtitle]="dayLabel()"
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-4">
        @if (trips().length === 0) {
          <p class="text-body text-ink-muted">
            You have no trips booked for {{ dayLabel().toLowerCase() }}, so there is nothing to skip.
          </p>
        } @else if (trips().length === 1) {
          <p class="text-body text-ink-secondary">
            Your operator will be told you are not travelling, and your seat will not be held.
          </p>

          <div class="vx-card p-4">
            <p class="text-xl font-semibold tabular-nums tracking-tight text-ink">
              {{ time(trips()[0].scheduledStartAtUtc) }}
            </p>
            <p class="mt-0.5 text-body text-ink-secondary">{{ trips()[0].routeName }}</p>
            <p class="mt-0.5 text-meta text-ink-muted">
              {{ trips()[0].stopName ?? 'Your usual stop' }}
            </p>
          </div>
        } @else {
          <p class="text-body text-ink-secondary">
            Choose the trips you will not be taking. Anything you leave unticked stays booked.
          </p>

          <ul class="flex flex-col gap-3">
            @for (trip of trips(); track trip.tripId) {
              <li>
                <label
                  class="vx-card flex cursor-pointer items-center gap-3 p-4"
                  [style.border-color]="isChosen(trip) ? 'var(--vexto-primary)' : null"
                >
                  <input
                    type="checkbox"
                    class="vx-checkbox size-5 flex-none"
                    [checked]="isChosen(trip)"
                    (change)="toggle(trip)"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block text-lg font-semibold tabular-nums text-ink">
                      {{ time(trip.scheduledStartAtUtc) }}
                    </span>
                    <span class="mt-0.5 block truncate text-body text-ink-secondary">
                      {{ trip.routeName }}
                    </span>
                    <span class="block truncate text-meta text-ink-muted">
                      {{ trip.stopName ?? 'Your usual stop' }}
                    </span>
                  </span>
                  @if (isChosen(trip)) {
                    <vx-icon name="check-circle" [size]="20" class="text-primary" />
                  }
                </label>
              </li>
            }
          </ul>
        }
      </div>

      <div footer class="flex flex-col gap-2">
        @if (trips().length > 0) {
          <button
            type="button"
            class="vx-btn vx-btn-primary vx-btn-touch w-full"
            [disabled]="saving() || chosen().size === 0"
            (click)="confirm()"
          >
            {{ saving() ? 'Saving…' : 'Confirm absence' }}
          </button>
        }
        <button
          type="button"
          class="vx-btn vx-btn-ghost vx-btn-touch w-full"
          [disabled]="saving()"
          (click)="closed.emit()"
        >
          Cancel
        </button>
      </div>
    </vx-drawer>
  `,
})
export class SkipSheet {
  private readonly api = inject(PassengerSelfApi);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  /** The passenger's trips on the chosen day. Supplied by the home screen; no request is made. */
  readonly trips = input<readonly PassengerTrip[]>([]);
  /** ISO date the absence applies to. */
  readonly serviceDate = input.required<string>();

  readonly closed = output<void>();
  readonly declared = output<void>();

  protected readonly time = formatTime;
  protected readonly saving = signal(false);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());

  protected readonly dayLabel = computed(() => formatDayLabel(`${this.serviceDate()}T12:00:00Z`));

  constructor() {
    // A single trip is pre-selected: the sheet is then a confirmation, and asking somebody to tick
    // the only available box before confirming is a step that decides nothing.
    effect(() => {
      if (!this.open()) {
        return;
      }

      const trips = this.trips();

      this.chosen.set(new Set(trips.length === 1 ? trips.map(routeKeyOf) : []));
    });
  }

  protected isChosen(trip: PassengerTrip): boolean {
    return this.chosen().has(routeKeyOf(trip));
  }

  protected toggle(trip: PassengerTrip): void {
    const key = routeKeyOf(trip);

    this.chosen.update((current) => {
      const next = new Set(current);

      if (!next.delete(key)) {
        next.add(key);
      }

      return next;
    });
  }

  /**
   * Declares the absence, one call per chosen route.
   *
   * Sequential rather than parallel and reported as a total: two trips on the same route are one
   * absence to the API, and firing both at once would race on the same record.
   */
  protected confirm(): void {
    const routes = [...this.chosen()];

    if (this.saving() || routes.length === 0) {
      return;
    }

    this.saving.set(true);

    // A passenger skipping every trip they have that day is skipping the day: one call with no
    // route is what the API models for that, and it also covers trips whose route is unknown.
    const skippingEverything = routes.length === new Set(this.trips().map(routeKeyOf)).size;
    const targets = skippingEverything ? [null] : routes;

    let affected = 0;
    let remaining = targets.length;
    let failure: string | null = null;

    const finish = () => {
      if (--remaining > 0) {
        return;
      }

      this.saving.set(false);

      if (failure) {
        this.toast.error(failure);

        return;
      }

      this.toast.success(
        affected > 0
          ? `Noted. ${affected} ${affected === 1 ? 'trip' : 'trips'} updated.`
          : 'Noted. You are marked as not travelling.',
      );
      this.declared.emit();
    };

    for (const routeId of targets) {
      this.api
        .declareAbsence({ serviceDate: this.serviceDate(), routeId, reason: null })
        .subscribe({
          next: (result) => {
            affected += Number(result.tripsAffected);
            finish();
          },
          error: (error: unknown) => {
            failure =
              error instanceof VextoApiError ? error.message : 'We could not save that.';
            finish();
          },
        });
    }
  }
}

/**
 * What the API can actually be told to skip.
 *
 * Absences are declared per route and per day, not per trip, so two departures on the same route
 * are one choice. Trips whose route is not known fall back to their own id, which the caller then
 * treats as "the whole day".
 */
function routeKeyOf(trip: PassengerTrip): string {
  return trip.routeId ?? trip.tripId;
}
