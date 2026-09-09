import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TripActivityEvent } from '@vexto/models';
import { VxActivityItem, VxEmptyState, VxSkeleton, type VxIconName } from '@vexto/ui';
import { formatTime } from '@vexto/utilities';

/** How each event type is drawn. Unknown types fall back rather than disappearing. */
type EventStyle = {
  readonly icon: VxIconName;
  readonly tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
};

const STYLES: Readonly<Record<string, EventStyle>> = {
  TripGenerated: { icon: 'trips', tone: 'neutral' },
  TripReady: { icon: 'check', tone: 'info' },
  TripStarted: { icon: 'play', tone: 'success' },
  DriverChanged: { icon: 'drivers', tone: 'warning' },
  VehicleChanged: { icon: 'vehicle', tone: 'warning' },
  PassengerBoarded: { icon: 'check-circle', tone: 'success' },
  PassengerNoShow: { icon: 'alert', tone: 'danger' },
  PassengerDroppedOff: { icon: 'flag', tone: 'info' },
  PassengerSkipped: { icon: 'calendar', tone: 'neutral' },
  TripCancelled: { icon: 'ban', tone: 'danger' },
  TripCompleted: { icon: 'flag', tone: 'primary' },
};

const FALLBACK: EventStyle = { icon: 'info', tone: 'neutral' };

/**
 * What actually happened on this trip, in the order it happened.
 *
 * **Every entry is a row the backend wrote at the moment it happened.** This panel used to assemble
 * a timeline from the timestamps scattered across the trip and its manifest, which meant the things
 * a dispatcher most wants to see — a driver swapped, a bus swapped, a trip called off — could not
 * appear at all, because nothing anywhere recorded when they happened. The read model behind
 * `GET /api/v1/trips/{id}/activity` fixed that; this component now renders it and invents nothing.
 *
 * The wording and the second line come from the server too. That is not laziness: they were written
 * against the state as it was at the time, so "A 12345 → B 55421" still says what changed after both
 * buses have been sold. A caption reassembled here from the trip's current values would quietly
 * rewrite history.
 */
@Component({
  selector: 'vexto-trip-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxActivityItem, VxEmptyState, VxSkeleton],
  template: `
    @if (loading()) {
      <div class="flex flex-col gap-4 px-4 py-4 sm:px-5">
        @for (row of [0, 1, 2]; track row) {
          <vx-skeleton height="2.5rem" />
        }
      </div>
    } @else if (events().length === 0) {
      <vx-empty-state
        icon="activity"
        title="No activity recorded yet"
        description="Activity appears as the trip runs — when it starts, as each passenger is boarded or marked absent, and whenever the driver or vehicle changes."
      />
    } @else {
      <ul class="px-4 py-4 sm:px-5">
        @for (event of events(); track event.id; let last = $last) {
          <vx-activity-item
            [title]="event.summary"
            [detail]="detailOf(event)"
            [timestamp]="time(event.occurredAtUtc)"
            [icon]="styleOf(event).icon"
            [tone]="styleOf(event).tone"
            [last]="last"
          />
        }
      </ul>

      @if (hasMore()) {
        <p class="border-t border-line-subtle px-4 py-3 text-meta text-ink-muted sm:px-5">
          Only the most recent events are shown.
        </p>
      }
    }
  `,
})
export class TripActivity {
  readonly events = input.required<readonly TripActivityEvent[]>();
  readonly loading = input(false);
  /** True when the server capped the list, so a short timeline is not mistaken for a quiet trip. */
  readonly hasMore = input(false);

  protected readonly time = formatTime;

  protected styleOf(event: TripActivityEvent): EventStyle {
    return STYLES[event.type] ?? FALLBACK;
  }

  /**
   * The second line: the server's own detail, with the actor appended when there is one.
   *
   * Joined rather than given its own row because they answer one question — "what changed, and who
   * did it" — and a timeline that gave each half a line would be twice as tall for no more meaning.
   */
  protected detailOf(event: TripActivityEvent): string | null {
    const parts = [event.detail, event.actor?.displayName].filter(
      (part): part is string => !!part && part.length > 0,
    );

    return parts.length > 0 ? parts.join(' · ') : null;
  }
}
