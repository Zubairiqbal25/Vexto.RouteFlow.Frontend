import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RouteStop } from '@vexto/models';
import { VxIcon, VxStatusBadge } from '@vexto/ui';

/**
 * The stops of a route, drawn as the journey they are.
 *
 * A route is a *sequence*, and a table sorted by a numeric column hides that: the thing a planner
 * is checking — does the bus go Silicon Oasis, then Academic City, then Business Bay — is the shape
 * of the list, not the values in it. The numbered rail is that shape.
 *
 * Three deliberate choices:
 *
 * - **Selection is two-way with the map.** Choosing a stop here highlights its pin, and choosing a
 *   pin highlights the row. The parent owns `selectedStopId`, so neither component has to know the
 *   other exists.
 * - **Reordering is move-up / move-down, not drag.** Drag needs a mouse, a steady hand and a
 *   pointer; two buttons work with a keyboard, on a touch screen and with a screen reader, and map
 *   exactly onto the reorder endpoint, which takes the whole new ordering in one request so a
 *   sequence is never left half-applied.
 * - **The pickup count comes from the assignments already loaded**, not from a per-stop request.
 *
 * Purely presentational: it renders what it is given and emits what was pressed. Loading, errors
 * and the API live in the tab that hosts it.
 */
@Component({
  selector: 'vexto-route-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon, VxStatusBadge],
  template: `
    <ol class="flex flex-col">
      @for (stop of stops(); track stop.id; let index = $index, last = $last) {
        <li class="relative flex gap-4">
          <!-- The rail. Hidden on the last stop so the journey ends rather than trailing off. -->
          @if (!last) {
            <span
              class="absolute start-[1.125rem] top-9 bottom-0 w-px"
              style="background: var(--vexto-border)"
              aria-hidden="true"
            ></span>
          }

          <span
            class="relative z-10 mt-1 flex size-9 flex-none items-center justify-center rounded-full
                   border text-meta font-semibold tabular-nums transition-colors"
            [style.background]="
              stop.id === selectedStopId() ? 'var(--vexto-primary)' : 'var(--vexto-surface)'
            "
            [style.border-color]="
              stop.id === selectedStopId() ? 'var(--vexto-primary)' : 'var(--vexto-primary-200)'
            "
            [style.color]="
              stop.id === selectedStopId() ? 'var(--vexto-on-primary, #fff)' : 'var(--vexto-primary-active)'
            "
          >
            {{ sequence(index) }}
          </span>

          <div class="min-w-0 flex-1 pb-6" [class.pb-0]="last">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <!--
                The whole row is the selector rather than a separate "highlight" control: the thing
                an operator wants when they click a stop is to see where it is.
              -->
              <button
                type="button"
                class="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-start transition-colors
                       hover:bg-surface-hover"
                [class.bg-surface-hover]="stop.id === selectedStopId()"
                [attr.aria-pressed]="stop.id === selectedStopId()"
                (click)="selected.emit(stop.id)"
              >
                <p class="truncate font-medium text-ink">{{ stop.name }}</p>
                <p class="mt-0.5 truncate text-meta text-ink-muted">
                  {{ stop.address || 'No address recorded' }}
                </p>

                <div class="mt-2 flex flex-wrap items-center gap-2">
                  @if (last) {
                    <vx-status-badge tone="info" icon="flag" label="Destination" />
                  } @else {
                    <vx-status-badge tone="neutral" [label]="typeLabel(stop.stopType)" />
                  }

                  <!--
                    Zero is stated rather than hidden. A stop nobody boards at is exactly the thing
                    worth noticing on a route that is over capacity somewhere else.
                  -->
                  <span class="inline-flex items-center gap-1.5 text-meta text-ink-secondary">
                    <vx-icon name="passengers" [size]="14" />
                    {{ pickupCount(stop.id) }}
                    {{ pickupCount(stop.id) === 1 ? 'passenger' : 'passengers' }}
                  </span>

                  @if (stop.estimatedArrivalOffsetMinutes !== null) {
                    <span class="inline-flex items-center gap-1.5 text-meta text-ink-secondary">
                      <vx-icon name="clock" [size]="14" />
                      {{ arrival(stop.estimatedArrivalOffsetMinutes) }}
                    </span>
                  }
                </div>

                @if (stop.instructions) {
                  <p class="mt-2 max-w-prose text-meta text-ink-secondary">{{ stop.instructions }}</p>
                }
              </button>

              @if (editable()) {
                <div class="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Move ' + stop.name + ' earlier'"
                    [disabled]="index === 0 || busy()"
                    (click)="moved.emit({ index, delta: -1 })"
                  >
                    <!--
                      One glyph, rotated, rather than two different chevrons. Rotating chevron-left
                      by ±90° produced two arrows that both read as pointing down — the disabled
                      states were right and the icons said nothing, which is worse than no icon.
                    -->
                    <vx-icon name="chevron-down" [size]="16" class="rotate-180" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Move ' + stop.name + ' later'"
                    [disabled]="last || busy()"
                    (click)="moved.emit({ index, delta: 1 })"
                  >
                    <vx-icon name="chevron-down" [size]="16" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Edit ' + stop.name"
                    (click)="edited.emit(stop)"
                  >
                    <vx-icon name="edit" [size]="16" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Remove ' + stop.name"
                    (click)="removed.emit(stop)"
                  >
                    <vx-icon name="trash" [size]="16" />
                  </button>
                </div>
              }
            </div>
          </div>
        </li>
      }
    </ol>
  `,
})
export class RouteTimeline {
  readonly stops = input.required<readonly RouteStop[]>();
  /** Boarding counts keyed by stop id. A stop absent from the map has none. */
  readonly pickupCounts = input<ReadonlyMap<string, number>>(new Map());
  readonly selectedStopId = input<string | null>(null);
  /** Departure time as `HH:mm`, used to turn a stop's offset into a real clock time. */
  readonly departureTime = input<string | null>(null);
  /** False for a viewer without Routes.Manage: the timeline is still fully readable. */
  readonly editable = input(false);
  /** Disables reordering while a reorder request is in flight. */
  readonly busy = input(false);

  readonly selected = output<string>();
  readonly edited = output<RouteStop>();
  readonly removed = output<RouteStop>();
  readonly moved = output<{ index: number; delta: number }>();

  /** Position comes from array order, so numbering stays right during an optimistic reorder. */
  protected sequence(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected pickupCount(stopId: string): number {
    return this.pickupCounts().get(stopId) ?? 0;
  }

  protected typeLabel(stopType: string): string {
    return stopType === 'PickupAndDropOff'
      ? 'Pickup & drop-off'
      : stopType === 'DropOff'
        ? 'Drop-off'
        : 'Pickup';
  }

  /**
   * The offset shown as a clock time when the route has a departure, and as an offset when it does
   * not.
   *
   * "06:15" is what a dispatcher reads off a schedule; "+15 min" is only useful if you already know
   * when the bus leaves. When the route has no default start time there is nothing to add the
   * offset to, and inventing a departure to make the display prettier would be inventing data.
   */
  protected arrival(offsetMinutes: number | string): string {
    const offset = Number(offsetMinutes);
    const departure = this.departureTime();

    if (!departure) {
      return `+${offset} min`;
    }

    const [hours, minutes] = departure.slice(0, 5).split(':').map(Number);

    if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return `+${offset} min`;
    }

    const total = (hours * 60 + minutes + offset + 1440) % 1440;

    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
}
