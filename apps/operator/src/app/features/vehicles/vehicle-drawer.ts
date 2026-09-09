import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { VehicleOperations, VehicleResponse } from '@vexto/models';
import {
  VxAttentionNote,
  VxCardFact,
  VxDrawer,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatDayTime, humanizeEnum } from '@vexto/utilities';

/**
 * A vehicle, inspected without leaving the list.
 *
 * Answers the roster question — can I put this bus on tomorrow's route — which is capacity, status,
 * and what it is already committed to. "Active" is not the same as "available": a bus can be
 * perfectly serviceable and still out on a route until 09:00, and that distinction is the whole
 * point of the drawer.
 *
 * **It makes no request.** The plate, capacity and status are on the list row already, and what the
 * vehicle is running now and next comes from the batched operations read model the page loads once
 * for the whole page. A drawer that fetched a vehicle on every open would turn a grid of forty into
 * forty requests to show data the browser was already holding.
 */
@Component({
  selector: 'vexto-vehicle-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxAttentionNote, VxCardFact, VxDrawer, VxIcon, VxStatusBadge],
  template: `
    <vx-drawer
      [open]="vehicle() !== null"
      [title]="plate()"
      [subtitle]="descriptor()"
      (closed)="closed.emit()"
    >
      @if (vehicle(); as bus) {
        <div class="flex flex-col gap-5">
          <div class="flex items-center gap-4">
            <span
              class="flex size-16 flex-none items-center justify-center rounded-2xl"
              [style.background]="onTrip() ? 'var(--vexto-success-soft)' : 'var(--vexto-surface-sunken)'"
              [style.color]="onTrip() ? 'var(--vexto-success-text)' : 'var(--vexto-text-secondary)'"
              aria-hidden="true"
            >
              <vx-icon name="vehicle" [size]="30" />
            </span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                @if (onTrip()) {
                  <vx-status-badge tone="success" label="On trip" />
                }
                <vx-status-badge [status]="bus.status" />
              </div>
              <p class="mt-2 truncate text-meta text-ink-muted">Added {{ date(bus.createdAtUtc) }}</p>
            </div>
          </div>

          @if (warning(); as note) {
            <vx-attention-note [level]="note.level">
              <vx-icon [name]="note.icon" [size]="15" />
              {{ note.label }}
            </vx-attention-note>
          }

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Plate" [value]="plate()" />
            <vx-card-fact label="Type" [value]="label(bus.vehicleType)" />
            <vx-card-fact label="Capacity" [value]="bus.capacity + ' seats'" />
            <vx-card-fact label="Status" [value]="label(bus.status)" />
          </div>

          <div>
            <p class="vx-section-label mb-2">Right now</p>
            @if (operations(); as ops) {
              @if (ops.activeTripId) {
                <div class="grid grid-cols-2 gap-4">
                  <vx-card-fact label="Route" [value]="ops.activeRouteName" />
                  <vx-card-fact label="Driver" [value]="ops.activeDriverName ?? 'Unassigned'" />
                </div>
                <a
                  class="vx-btn vx-btn-secondary vx-btn-sm mt-3"
                  [routerLink]="['/trips', ops.activeTripId]"
                  (click)="closed.emit()"
                >
                  Open the running trip
                </a>
              } @else {
                <p class="text-body text-ink-muted">Not on a trip. Available to assign.</p>
              }
            } @else {
              <p class="text-body text-ink-muted">
                We have no live operational record for this vehicle.
              </p>
            }
          </div>

          <div>
            <p class="vx-section-label mb-2">Next trip</p>
            @if (operations()?.nextTripId; as nextTripId) {
              <div class="grid grid-cols-2 gap-4">
                <vx-card-fact label="Departs" [value]="nextDeparture()" />
                <vx-card-fact label="Route" [value]="operations()?.nextRouteName ?? '—'" />
              </div>
              <a
                class="vx-btn vx-btn-secondary vx-btn-sm mt-3"
                [routerLink]="['/trips', nextTripId]"
                (click)="closed.emit()"
              >
                Open next trip
              </a>
            } @else {
              <p class="text-body text-ink-muted">Nothing booked.</p>
            }
          </div>
        </div>
      }

      <div footer class="flex flex-wrap gap-2">
        <button type="button" class="vx-btn vx-btn-secondary flex-1" (click)="closed.emit()">
          Close
        </button>
        @if (canManage()) {
          <button
            type="button"
            class="vx-btn vx-btn-primary flex-1"
            (click)="vehicle() && edit.emit(vehicle()!)"
          >
            Edit vehicle
          </button>
        }
      </div>
    </vx-drawer>
  `,
})
export class VehicleDrawer {
  readonly vehicle = input<VehicleResponse | null>(null);
  /** From the page's batched operations lookup; null when the vehicle has no live record. */
  readonly operations = input<VehicleOperations | null>(null);
  readonly canManage = input(false);

  readonly closed = output<void>();
  readonly edit = output<VehicleResponse>();

  protected readonly date = formatDate;
  protected readonly label = humanizeEnum;

  protected readonly plate = computed(() => {
    const bus = this.vehicle();

    return bus ? [bus.emirate, bus.plateCode, bus.plateNumber].filter(Boolean).join(' ') : '';
  });

  protected readonly descriptor = computed(() => {
    const bus = this.vehicle();

    if (!bus) {
      return null;
    }

    const parts = [bus.make, bus.model, bus.year?.toString()].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : humanizeEnum(bus.vehicleType);
  });

  protected readonly onTrip = computed(() => this.operations()?.activeTripId != null);

  protected readonly nextDeparture = computed(() => {
    const at = this.operations()?.nextDepartureAtUtc;

    return at ? formatDayTime(at) : '—';
  });

  /** Maintenance is a warning; retirement is quieter, because somebody chose it deliberately. */
  protected readonly warning = computed<{
    level: 'warning' | 'info';
    icon: 'wrench' | 'info';
    label: string;
  } | null>(() => {
    const status = this.vehicle()?.status;

    if (status === 'Maintenance') {
      return { level: 'warning', icon: 'wrench', label: 'In maintenance — not available to roster' };
    }

    return status === 'Inactive'
      ? { level: 'info', icon: 'info', label: 'Retired from service' }
      : null;
  });
}
