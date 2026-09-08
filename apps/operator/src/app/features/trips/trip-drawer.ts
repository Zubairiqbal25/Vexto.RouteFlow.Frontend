import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TripResponse } from '@vexto/models';
import {
  VxAvatar,
  VxCardFact,
  VxDrawer,
  VxIcon,
  VxProgressBar,
  type VxProgressSegment,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatTime } from '@vexto/utilities';
import type { TripTracking } from './trip-card';

/**
 * A trip, inspected without leaving the board.
 *
 * **Deliberately not the whole record.** The drawer answers "what is happening on this one" — who
 * is driving, which bus, how far through the pickups, is it reporting — and offers a way to the
 * full screen for anything else. Putting every field in here would make it a second trip page that
 * has to be kept in step with the first.
 *
 * It reuses the list row already loaded, so opening it costs no request at all. That is what makes
 * it worth having over a navigation: an answer in the time it takes to click.
 */
@Component({
  selector: 'vexto-trip-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxCardFact, VxDrawer, VxIcon, VxProgressBar, VxStatusBadge],
  template: `
    <vx-drawer
      [open]="trip() !== null"
      [title]="trip()?.route?.name ?? ''"
      [subtitle]="subtitle()"
      (closed)="closed.emit()"
    >
      @if (trip(); as loaded) {
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-center gap-2">
            <vx-status-badge [status]="loaded.status" />
            @if (tracking(); as state) {
              <vx-status-badge
                [tone]="state === 'live' ? 'success' : state === 'stale' ? 'warning' : 'danger'"
                [label]="
                  state === 'live'
                    ? 'Tracking live'
                    : state === 'stale' ? 'Tracking stale' : 'Not reporting'
                "
              />
            }
          </div>

          <div class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Departs" [value]="departs()" />
            <vx-card-fact label="Service date" [value]="serviceDate()" />
          </div>

          <div>
            <p class="vx-section-label mb-2">Crew</p>
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-3">
                <vx-avatar
                  size="md"
                  [name]="loaded.driver?.name"
                  [hasPhoto]="false"
                  [photoPath]="driverPhotoPath()"
                />
                <div class="min-w-0">
                  <p class="truncate text-body font-medium text-ink">
                    {{ loaded.driver?.name ?? 'No driver assigned' }}
                  </p>
                  <p class="text-meta text-ink-muted">Driver</p>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <span
                  class="flex size-9 flex-none items-center justify-center rounded-lg"
                  style="background: var(--vexto-surface-sunken); color: var(--vexto-text-secondary)"
                >
                  <vx-icon name="vehicle" [size]="18" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-body font-medium text-ink">
                    {{ loaded.vehicle?.plateNumber ?? 'No vehicle assigned' }}
                  </p>
                  <p class="text-meta text-ink-muted">Vehicle</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="vx-section-label mb-2">Attendance</p>
            @if (loaded.passengerCount === 0) {
              <p class="text-body text-ink-muted">Nobody is booked on this trip.</p>
            } @else {
              <vx-progress-bar
                [segments]="segments()"
                [total]="loaded.passengerCount"
                [headline]="headline()"
              />
            }
          </div>
        </div>
      }

      <div footer class="flex gap-2">
        <button type="button" class="vx-btn vx-btn-secondary flex-1" (click)="closed.emit()">
          Close
        </button>
        <button
          type="button"
          class="vx-btn vx-btn-primary flex-1"
          (click)="trip() && openFull.emit(trip()!)"
        >
          Open full trip
        </button>
      </div>
    </vx-drawer>
  `,
})
export class TripDrawer {
  readonly trip = input<TripResponse | null>(null);
  readonly tracking = input<TripTracking>(null);

  readonly closed = output<void>();
  readonly openFull = output<TripResponse>();
  readonly action = output<{ trip: TripResponse; action: string }>();

  protected readonly subtitle = computed(() => this.trip()?.route.code ?? null);

  protected readonly departs = computed(() =>
    this.trip() ? formatTime(this.trip()!.scheduledStartAtUtc) : '—',
  );

  protected readonly serviceDate = computed(() =>
    this.trip() ? formatDate(this.trip()!.serviceDate) : '—',
  );

  protected readonly driverPhotoPath = computed(() => {
    const driverId = this.trip()?.driver?.id;

    return driverId ? `/api/v1/drivers/${driverId}/photo` : null;
  });

  protected readonly segments = computed<VxProgressSegment[]>(() => {
    const attendance = this.trip()?.attendance;

    if (!attendance) {
      return [];
    }

    return [
      { label: 'boarded', value: attendance.boarded + attendance.droppedOff, tone: 'success' },
      { label: 'awaited', value: attendance.expected, tone: 'neutral' },
      { label: 'no-show', value: attendance.noShow, tone: 'danger' },
      { label: 'absent', value: attendance.skipped, tone: 'warning' },
    ];
  });

  protected readonly headline = computed(() => {
    const trip = this.trip();

    if (!trip) {
      return null;
    }

    const boarded = trip.attendance.boarded + trip.attendance.droppedOff;

    return `${boarded} / ${trip.passengerCount} boarded`;
  });
}
