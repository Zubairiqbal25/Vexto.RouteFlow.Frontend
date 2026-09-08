import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TripResponse } from '@vexto/models';
import {
  VxAvatar,
  type VxCardAction,
  VxCardFact,
  VxEntityCard,
  VxIcon,
  VxProgressBar,
  type VxProgressSegment,
  VxStatusBadge,
} from '@vexto/ui';
import { formatTime } from '@vexto/utilities';

/** How the bus on this trip is reporting. Resolved by the board, which holds the fleet feed. */
export type TripTracking = 'live' | 'stale' | 'offline' | null;

/**
 * One trip on the operations board.
 *
 * Answers, in order: is it running, is it on time, who is driving, which bus, and how far through
 * the pickups it is. The departure time leads because that is what a dispatcher scans by — a board
 * sorted by time is read as a timetable, and the time has to be the anchor of each row.
 *
 * The attendance bar only appears once a trip has started. A five-segment bar under a trip that
 * departs in four hours is decoration, and it competes with the trips that genuinely need looking
 * at.
 */
@Component({
  selector: 'vexto-trip-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxAvatar,
    VxCardFact,
    VxEntityCard,
    VxIcon,
    VxProgressBar,
    VxStatusBadge,
  ],
  template: `
    <vx-entity-card
      [title]="trip().route.name"
      [subtitle]="trip().route.code"
      [actions]="actions()"
      [selected]="selected()"
      (opened)="opened.emit()"
      (action)="action.emit($event)"
    >
      <!-- The departure time as the card's anchor, not a fact buried in a grid. -->
      <span
        media
        class="flex w-14 flex-none flex-col items-center justify-center rounded-xl py-2"
        [style.background]="running() ? 'var(--vexto-success-soft)' : 'var(--vexto-surface-sunken)'"
        [style.color]="running() ? 'var(--vexto-success-text)' : 'var(--vexto-text-secondary)'"
      >
        <span class="text-[0.9375rem] font-semibold tabular-nums leading-tight">{{ clock() }}</span>
        @if (meridiem(); as suffix) {
          <span class="text-[0.625rem] uppercase tracking-wide opacity-80">{{ suffix }}</span>
        }
      </span>

      <vx-status-badge status [status]="trip().status" />

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <vx-avatar
            size="sm"
            [name]="trip().driver?.name"
            [hasPhoto]="false"
            [photoPath]="driverPhotoPath()"
          />
          <div class="min-w-0">
            <p class="vx-section-label">Driver</p>
            <p class="truncate text-body font-medium text-ink">
              {{ trip().driver?.name ?? 'Unassigned' }}
            </p>
          </div>
        </div>

        <vx-card-fact label="Vehicle" [value]="trip().vehicle?.plateNumber ?? 'Unassigned'" />
      </div>

      @if (tracking(); as state) {
        <!-- Named, not just coloured: "Live" and "Offline" are the words a dispatcher uses. -->
        <p class="mt-3">
          <vx-status-badge
            [tone]="state === 'live' ? 'success' : state === 'stale' ? 'warning' : 'danger'"
            [icon]="state === 'live' ? 'signal' : 'signal-off'"
            [label]="
              state === 'live'
                ? 'Tracking live'
                : state === 'stale' ? 'Tracking stale' : 'Not reporting'
            "
          />
        </p>
      }

      @if (showProgress()) {
        <div class="mt-4">
          <vx-progress-bar
            [segments]="segments()"
            [total]="trip().passengerCount"
            [headline]="progressHeadline()"
            [caption]="remainingCaption()"
          />
        </div>
      } @else {
        <p class="mt-4 flex items-center gap-1.5 text-meta text-ink-muted">
          <vx-icon name="passengers" [size]="14" />
          {{ trip().passengerCount }}
          {{ trip().passengerCount === 1 ? 'passenger booked' : 'passengers booked' }}
        </p>
      }
    </vx-entity-card>
  `,
})
export class TripCard {
  readonly trip = input.required<TripResponse>();
  readonly tracking = input<TripTracking>(null);
  readonly selected = input(false);
  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly running = computed(() => this.trip().status === 'Started');

  private readonly time = computed(() => formatTime(this.trip().scheduledStartAtUtc));

  /**
   * The clock half of the departure time, so the chip can set it large.
   *
   * `formatTime` may or may not produce a meridiem depending on the viewer's locale, so both halves
   * are derived from one split rather than assumed — a 24-hour locale gets the time and no suffix,
   * not the time followed by an empty line.
   */
  protected readonly clock = computed(() => this.time().split(' ')[0] ?? this.time());

  protected readonly meridiem = computed(() => {
    const parts = this.time().split(' ');

    return parts.length > 1 ? parts[parts.length - 1]! : null;
  });

  protected readonly driverPhotoPath = computed(() => {
    const driverId = this.trip().driver?.id;

    return driverId ? `/api/v1/drivers/${driverId}/photo` : null;
  });

  /** Progress is only meaningful once somebody could actually have boarded. */
  protected readonly showProgress = computed(
    () => this.trip().status === 'Started' || this.trip().status === 'Completed',
  );

  protected readonly segments = computed<VxProgressSegment[]>(() => {
    const attendance = this.trip().attendance;

    return [
      { label: 'boarded', value: attendance.boarded + attendance.droppedOff, tone: 'success' },
      { label: 'awaited', value: attendance.expected, tone: 'neutral' },
      { label: 'no-show', value: attendance.noShow, tone: 'danger' },
      { label: 'absent', value: attendance.skipped, tone: 'warning' },
    ];
  });

  protected readonly progressHeadline = computed(() => {
    const attendance = this.trip().attendance;
    const boarded = attendance.boarded + attendance.droppedOff;

    return `${boarded} / ${this.trip().passengerCount} boarded`;
  });

  protected readonly remainingCaption = computed(() => {
    const remaining = this.trip().attendance.expected;

    return remaining > 0 ? `${remaining} still awaited` : 'Everyone accounted for';
  });

  /**
   * What can be done from the card, given where the trip is.
   *
   * A completed trip offers nothing but a look at it: attendance is closed, and offering Cancel on
   * a journey that already ran is an action that can only produce a confusing error.
   */
  protected readonly actions = computed<VxCardAction[]>(() => {
    const status = this.trip().status;

    if (status === 'Completed' || status === 'Cancelled') {
      return [{ id: 'open', label: 'Open trip', icon: 'eye' }];
    }

    return [
      { id: 'open', label: 'Open trip', icon: 'eye' },
      { id: 'crew', label: 'Change crew', icon: 'switch' },
      { id: 'cancel', label: 'Cancel trip', icon: 'ban', danger: true },
    ];
  });
}
