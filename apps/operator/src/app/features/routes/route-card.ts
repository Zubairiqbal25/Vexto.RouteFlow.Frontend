import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { RouteListItem } from '@vexto/models';
import {
  VxAttentionNote,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxStatusBadge,
} from '@vexto/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A route, presented as the transport service it is rather than as a database row.
 *
 * The name of a route is its journey — "DSO → Business Bay" — so the card leads with that and puts
 * the code underneath as the thing people type into a filter. A small origin-to-destination rule
 * under the title makes the direction readable at a glance without a map.
 *
 * The three facts that decide whether a route is ready to run are stops, passengers and crew, so
 * those are the body. A route with no schedule cannot generate trips, and that is worth saying on
 * the card rather than discovering on the Generate Trips screen.
 */
@Component({
  selector: 'vexto-route-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAttentionNote, VxCardFact, VxEntityCard, VxIcon, VxStatusBadge],
  template: `
    <vx-entity-card
      [title]="item().route.name"
      [subtitle]="item().route.code"
      [actions]="actions()"
      [selected]="selected()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <span
        media
        class="flex size-12 flex-none items-center justify-center rounded-xl"
        [style.background]="active() ? 'var(--vexto-primary-soft)' : 'var(--vexto-surface-sunken)'"
        [style.color]="active() ? 'var(--vexto-primary-active)' : 'var(--vexto-text-secondary)'"
        aria-hidden="true"
      >
        <vx-icon name="route-line" [size]="24" />
      </span>

      <vx-status-badge status [status]="item().route.status" />

      <!-- The journey as a line. Decorative, but it is what makes a grid of routes read as services
           rather than as records — and the direction is stated in the title regardless. -->
      <div class="mt-3 flex items-center gap-2" aria-hidden="true">
        <span class="size-2 flex-none rounded-full" style="background: var(--vexto-primary)"></span>
        <span class="h-px flex-1" style="background: var(--vexto-border-strong)"></span>
        <span class="text-[0.625rem] uppercase tracking-wide text-ink-muted">
          {{ item().stopCount }} stops
        </span>
        <span class="h-px flex-1" style="background: var(--vexto-border-strong)"></span>
        <span
          class="size-2 flex-none rounded-full"
          style="background: var(--vexto-primary); opacity: 0.45"
        ></span>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <vx-card-fact label="Passengers" [value]="item().activePassengerCount" />
        <vx-card-fact label="Schedule" [value]="scheduleLabel()" />
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <vx-card-fact label="Driver" [value]="item().currentDriverName ?? 'Unassigned'" />
        <vx-card-fact label="Vehicle" [value]="item().currentVehiclePlateNumber ?? 'Unassigned'" />
      </div>

      @if (readiness(); as note) {
        <vx-attention-note class="mt-3" [level]="note.level">
          <vx-icon [name]="note.icon" [size]="15" />
          {{ note.label }}
        </vx-attention-note>
      }
    </vx-entity-card>
  `,
})
export class RouteCard {
  readonly item = input.required<RouteListItem>();
  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly active = computed(() => this.item().route.status === 'Active');

  protected readonly scheduleLabel = computed(() => {
    const count = this.item().scheduleCount;

    if (count === 0) {
      return 'Not scheduled';
    }

    // The default departure time is the useful half; the days are on the detail screen.
    const time = this.item().route.defaultStartTime;

    return time ? `${count} × ${time.slice(0, 5)}` : `${count} per week`;
  });

  /**
   * The one thing standing between this route and running, if anything is.
   *
   * Ordered by what blocks first: without stops there is nothing to schedule, without a schedule
   * there are no trips, and without crew a generated trip cannot depart. Only the first is shown —
   * a card listing three problems is a card nobody reads to the end.
   */
  protected readonly readiness = computed<{
    level: 'warning' | 'info';
    icon: 'map-pin' | 'calendar' | 'alert';
    label: string;
  } | null>(() => {
    const item = this.item();

    if (item.stopCount === 0) {
      return { level: 'warning', icon: 'map-pin', label: 'No stops yet — add pickup points' };
    }

    if (item.scheduleCount === 0) {
      return { level: 'warning', icon: 'calendar', label: 'No schedule — trips cannot be generated' };
    }

    if (!item.currentDriverId || !item.currentVehicleId) {
      return { level: 'info', icon: 'alert', label: 'No crew rostered for this route' };
    }

    return null;
  });

  protected readonly actions = computed<VxCardAction[]>(() => {
    const item = this.item();

    return [
      { id: 'open', label: 'Open route', icon: 'eye' },
      {
        id: 'generate',
        label: 'Generate trips',
        icon: 'calendar',

        // Offering it when it cannot succeed only produces an error the operator has to decode.
        disabled: item.scheduleCount === 0 || item.route.status !== 'Active',
      },
      { id: 'edit', label: 'Edit route', icon: 'edit' },
      item.route.status === 'Active'
        ? { id: 'deactivate', label: 'Deactivate', icon: 'power', danger: true }
        : { id: 'activate', label: 'Activate', icon: 'check' },
    ];
  });
}

/** Turns a day index into the short label the schedule chips use. */
export function dayLabel(day: number | string): string {
  const index = typeof day === 'number' ? day : DAYS.indexOf(day.slice(0, 3));

  return DAYS[index] ?? String(day).slice(0, 3);
}
