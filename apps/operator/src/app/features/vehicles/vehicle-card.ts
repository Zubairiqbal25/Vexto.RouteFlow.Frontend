import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { VehicleOperations, VehicleResponse } from '@vexto/models';
import {
  VxAttentionNote,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatTime } from '@vexto/utilities';

/**
 * A vehicle, as somebody deciding what to roster reads it.
 *
 * Answers four questions in order: what is this, is it available, what is it doing, and is anything
 * wrong. The plate leads because it is how an operator refers to a bus — not the make, and never
 * the id.
 *
 * **"Available" is not the same as "Active".** A vehicle can be Active and still unavailable because
 * it is out on a route right now, and that distinction is the whole reason this card exists rather
 * than a status column. The operational line says which.
 */
@Component({
  selector: 'vexto-vehicle-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="plate()"
      [subtitle]="descriptor()"
      [actions]="actions()"
      [selected]="selected()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <span
        media
        class="flex size-12 flex-none items-center justify-center rounded-xl"
        [style.background]="onTrip() ? 'var(--vexto-success-soft)' : 'var(--vexto-surface-sunken)'"
        [style.color]="onTrip() ? 'var(--vexto-success-text)' : 'var(--vexto-text-secondary)'"
        aria-hidden="true"
      >
        <vx-icon name="vehicle" [size]="24" />
      </span>

      <!--
        One badge, not two. A bus that is out on a trip is self-evidently active, and showing both
        squeezed the plate — the thing an operator identifies the vehicle by — down to "Dubai…".
        "On trip" is the more operational of the two answers, so it wins when both are true.
      -->
      <span status class="flex items-center gap-1.5">
        @if (onTrip()) {
          <vx-status-badge tone="success" label="On trip" />
        } @else {
          <vx-status-badge [status]="vehicle().status" />
        }
      </span>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Capacity" [value]="vehicle().capacity + ' seats'" />
        <vx-card-fact label="Type" [value]="vehicle().vehicleType" />
      </div>

      @if (operations(); as ops) {
        @if (ops.activeRouteName) {
          <div class="mt-4 grid grid-cols-2 gap-3">
            <vx-card-fact label="Running" [value]="ops.activeRouteName" />
            <vx-card-fact label="Driver" [value]="ops.activeDriverName ?? 'Unassigned'" />
          </div>
        } @else if (ops.nextRouteName) {
          <div class="mt-4 grid grid-cols-2 gap-3">
            <vx-card-fact label="Next out" [value]="nextDeparture()" />
            <vx-card-fact label="Route" [value]="ops.nextRouteName" />
          </div>
        } @else {
          <p class="mt-4 text-meta text-ink-muted">Nothing booked. Available to assign.</p>
        }
      }

      @if (warning(); as note) {
        <vx-attention-note class="mt-3" [level]="note.level">
          <vx-icon [name]="note.icon" [size]="15" />
          {{ note.label }}
        </vx-attention-note>
      }
    </vx-entity-card>
  `,
})
export class VehicleCard {
  readonly vehicle = input.required<VehicleResponse>();

  /**
   * What the vehicle is running now and next.
   *
   * Null covers "still loading" and "nothing booked" differently: the batch returns no row for an
   * idle vehicle, so the page passes an explicit empty record rather than null once it has loaded.
   */
  readonly operations = input<VehicleOperations | null>(null);

  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly plate = computed(() => {
    const vehicle = this.vehicle();

    return [vehicle.emirate, vehicle.plateCode, vehicle.plateNumber].filter(Boolean).join(' ');
  });

  /** Make, model and year, whichever of them the operator bothered to record. */
  protected readonly descriptor = computed(() => {
    const vehicle = this.vehicle();
    const parts = [vehicle.make, vehicle.model, vehicle.year?.toString()].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : vehicle.vehicleType;
  });

  protected readonly onTrip = computed(() => this.operations()?.activeTripId != null);

  protected readonly nextDeparture = computed(() => {
    const at = this.operations()?.nextDepartureAtUtc;

    return at ? formatTime(at) : '—';
  });

  /**
   * The one operational problem worth putting on the card.
   *
   * Maintenance is a warning rather than a failure: the bus exists and will come back. An inactive
   * vehicle is quieter still — somebody retired it deliberately, and a card shouting about it in a
   * grid of forty is noise.
   */
  protected readonly warning = computed<{
    level: 'warning' | 'info';
    icon: 'wrench' | 'info';
    label: string;
  } | null>(() => {
    const status = this.vehicle().status;

    if (status === 'Maintenance') {
      return { level: 'warning', icon: 'wrench', label: 'In maintenance — not available to roster' };
    }

    if (status === 'Inactive') {
      return { level: 'info', icon: 'info', label: 'Retired from service' };
    }

    return null;
  });

  protected readonly actions = computed<VxCardAction[]>(() => {
    const status = this.vehicle().status;

    return [
      { id: 'edit', label: 'Edit details', icon: 'edit' },
      status === 'Maintenance'
        ? { id: 'activate', label: 'Return to service', icon: 'check' }
        : { id: 'maintenance', label: 'Send to maintenance', icon: 'wrench' },
      status === 'Active'
        ? { id: 'deactivate', label: 'Retire vehicle', icon: 'power', danger: true }
        : { id: 'activate', label: 'Activate vehicle', icon: 'check' },
    ];
  });
}
