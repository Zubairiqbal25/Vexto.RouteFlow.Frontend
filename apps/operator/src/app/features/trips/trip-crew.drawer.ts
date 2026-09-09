import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DriversApi, TripsApi, VehiclesApi, VextoApiError } from '@vexto/api-client';
import type { TripResponse } from '@vexto/models';
import {
  ToastService,
  VxAttentionNote,
  VxCardFact,
  VxDrawer,
  VxPicker,
  type VxPickerOption,
} from '@vexto/ui';

/**
 * Substituting the driver or the bus on one trip.
 *
 * Covers the sick driver and the vehicle in the workshop. **This trip only** — the route roster is
 * left alone, so every other trip keeps the crew it was planned with. That distinction is stated on
 * the drawer rather than assumed, because "change driver" is ambiguous between the two and getting
 * it wrong silently re-crews a month of journeys.
 *
 * **The two fields are searchable pickers, not dropdowns.** They used to be `<select>` elements
 * filled from the first fifty picker rows, which is the defect `VxPicker` exists to stop: on a
 * pilot database with more drivers than that, the ones past the cap could not be chosen at all and
 * nothing on screen said so — the list simply ended. The term now goes to the server and the server
 * decides what matches. The pickers still exclude anyone suspended and any bus off the road,
 * because those are precisely the substitutions the API would refuse.
 *
 * **A refusal keeps the drawer open with the choices intact.** The API answers 409 with a readable
 * business reason — the trip has started, the bus is too small, the driver is suspended — and it is
 * shown here, verbatim, beside the fields that caused it. Closing the drawer and firing a generic
 * toast would throw away the dispatcher's work and tell them less than the server already said.
 */
@Component({
  selector: 'vexto-trip-crew-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxCardFact, VxDrawer, VxPicker],
  template: `
    <vx-drawer
      [open]="open()"
      title="Change driver / vehicle"
      subtitle="This trip only. The route's roster is left as it is."
      (closed)="dismissed.emit()"
    >
      <div class="flex flex-col gap-5">
        @if (failure(); as message) {
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
            {{ trip()?.driver?.name ?? 'Nobody assigned' }}
          </p>
        </div>

        <div>
          <label class="vx-section-label" for="crew-driver">New driver</label>
          <div class="mt-1">
            <vx-picker
              inputId="crew-driver"
              placeholder="Search drivers…"
              emptyLabel="No drivers are available to roster."
              [limit]="20"
              [search]="searchDrivers"
              [selected]="driver()"
              [disabled]="saving()"
              (chosen)="driver.set($event)"
            />
          </div>
          <p class="mt-1.5 text-meta text-ink-muted">
            Only active drivers appear. Their licence number is shown, and its expiry when it is
            close.
          </p>
        </div>

        <div>
          <p class="vx-section-label">Current vehicle</p>
          <p class="mt-1 text-body font-medium text-ink">
            {{ trip()?.vehicle?.plateNumber ?? 'Nothing assigned' }}
          </p>
        </div>

        <div>
          <label class="vx-section-label" for="crew-vehicle">New vehicle</label>
          <div class="mt-1">
            <vx-picker
              inputId="crew-vehicle"
              placeholder="Search by plate or model…"
              emptyLabel="No vehicles are in service."
              [limit]="20"
              [search]="searchVehicles"
              [selected]="vehicle()"
              [disabled]="saving()"
              (chosen)="vehicle.set($event)"
            />
          </div>
          <p class="mt-1.5 text-meta text-ink-muted">
            Only vehicles in service appear, with their model and seat count.
          </p>
        </div>

        <div class="rounded-xl p-3.5" style="background: var(--vexto-surface-muted)">
          <dl class="grid grid-cols-2 gap-3">
            <vx-card-fact label="Vehicle capacity" [value]="capacity() ?? '—'" />
            <vx-card-fact label="Passengers on this trip" [value]="passengerCount()" />
          </dl>
          @if (shortfall()) {
            <div class="mt-3">
              <vx-attention-note level="critical">
                Vehicle capacity is insufficient for the {{ passengerCount() }} passengers expected.
              </vx-attention-note>
            </div>
          }
        </div>

        <p class="text-meta text-ink-muted">
          Affected passengers are notified of the change through their app.
        </p>
      </div>

      <div footer class="flex justify-end gap-2">
        <button
          type="button"
          class="vx-btn vx-btn-secondary"
          [disabled]="saving()"
          (click)="dismissed.emit()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="vx-btn vx-btn-primary"
          [disabled]="saving() || !driver() || !vehicle()"
          (click)="save()"
        >
          {{ saving() ? 'Saving…' : 'Confirm change' }}
        </button>
      </div>
    </vx-drawer>
  `,
})
export class TripCrewDrawer {
  private readonly api = inject(TripsApi);
  private readonly driversApi = inject(DriversApi);
  private readonly vehiclesApi = inject(VehiclesApi);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly trip = input<TripResponse | null>(null);

  readonly dismissed = output<void>();
  readonly changed = output<void>();

  protected readonly driver = signal<VxPickerOption | null>(null);
  protected readonly vehicle = signal<VxPickerOption | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly passengerCount = computed(() => Number(this.trip()?.passengerCount ?? 0));

  /**
   * Seats, read out of the picker's own secondary label ("Hiace · 24 seats").
   *
   * A local check that saves a round trip on the common mistake; the API remains the authority and
   * its 409 is what is shown if this and the server disagree.
   */
  protected readonly capacity = computed(() => {
    const seats = this.vehicle()?.secondaryLabel?.match(/(\d+)\s*seat/iu)?.[1];

    return seats ? Number(seats) : null;
  });

  protected readonly shortfall = computed(() => {
    const capacity = this.capacity();

    return capacity !== null && capacity < this.passengerCount();
  });

  /**
   * Bound as fields rather than methods so the picker's `input.required` gets one stable reference.
   * A new arrow function on every change detection run would restart the search stream.
   */
  protected readonly searchDrivers = (term: string) =>
    this.driversApi.picker({ search: term || undefined });

  protected readonly searchVehicles = (term: string) =>
    this.vehiclesApi.picker({ search: term || undefined });

  constructor() {
    // Reset when the drawer opens, so a previous refusal or a previous choice does not greet the
    // next substitution. The current crew is pre-selected: most substitutions change one of the two.
    effect(() => {
      if (!this.open()) {
        return;
      }

      const trip = this.trip();

      this.failure.set(null);
      this.driver.set(
        trip?.driver ? { id: trip.driver.id, label: trip.driver.name, secondaryLabel: null } : null,
      );
      this.vehicle.set(
        trip?.vehicle
          ? { id: trip.vehicle.id, label: trip.vehicle.plateNumber, secondaryLabel: null }
          : null,
      );

      // One lookup for the bus already on the trip, so the capacity fact below reads as a number
      // rather than as a dash before anything has been chosen. The trip snapshots the plate but not
      // the seat count — deliberately, because a trip is not a copy of the fleet — so the seats come
      // from the picker row, which is where every other capacity on this drawer comes from too.
      const plate = trip?.vehicle?.plateNumber;

      if (plate) {
        this.vehiclesApi.picker({ search: plate }).subscribe({
          next: (options) => {
            const match = options.find((option) => option.id === trip?.vehicle?.id);

            if (match) {
              this.vehicle.set(match);
            }
          },

          // A failure leaves the plate showing and the capacity as a dash. The API is still the
          // authority on whether the bus is big enough, and it refuses with a readable reason.
          error: () => undefined,
        });
      }
    });
  }

  protected save(): void {
    const trip = this.trip();
    const driverId = this.driver()?.id;
    const vehicleId = this.vehicle()?.id;

    if (!trip || this.saving() || !driverId || !vehicleId) {
      return;
    }

    this.saving.set(true);
    this.failure.set(null);

    this.api.changeResources(trip.id, { driverId, vehicleId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Crew changed for this trip.');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);

        // Kept in the drawer with both choices intact. The server's reason is the useful part —
        // "B 55421 seats 18; this trip expects 24 passengers" tells the dispatcher which bus to
        // pick instead, and a generic toast would not.
        this.failure.set(
          error instanceof VextoApiError ? error.message : 'We could not change the crew.',
        );
      },
    });
  }
}
