import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VxAttentionNote, VxAvatar, VxCardFact, VxIcon, VxSectionCard, VxStatusBadge } from '@vexto/ui';
import { formatDate, formatDayTime, formatTime } from '@vexto/utilities';
import { RouteWorkspaceStore } from './route-workspace.store';

/**
 * What an operator needs to know about a route before opening a single tab.
 *
 * The old overview was a definition list of the fields on the route record — code, direction,
 * created date — which answers questions nobody asks. This answers the four that get asked every
 * day: who drives it, what do they drive, when does it run, and when is the next one.
 *
 * Every card is also the door to fixing what it reports. "Unassigned" is not a dead end; it is a
 * button that opens the tab where an assignment is made.
 */
@Component({
  selector: 'vexto-route-overview-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VxAttentionNote,
    VxAvatar,
    VxCardFact,
    VxIcon,
    VxSectionCard,
    VxStatusBadge,
  ],
  template: `
    @if (gaps().length > 0) {
      <section class="vx-card vx-card-pad mb-6">
        <h2 class="text-body font-semibold text-ink">Before this route can run</h2>
        <p class="mt-1 text-meta text-ink-muted">
          Each of these is something to set up. Trips cannot be generated until the first two are
          done.
        </p>
        <ul class="mt-4 flex flex-col gap-2">
          @for (gap of gaps(); track gap.id) {
            <li>
              <vx-attention-note [level]="gap.level">
                <span class="font-semibold">{{ gap.label }}</span>
                <span class="font-normal">— {{ gap.detail }}</span>
              </vx-attention-note>
            </li>
          }
        </ul>
      </section>
    }

    <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <!-- Driver ------------------------------------------------------------------------------ -->
      <vx-section-card title="Assigned driver">
        <button
          header-actions
          type="button"
          class="vx-btn vx-btn-ghost vx-btn-sm"
          (click)="openTab.emit('crew')"
        >
          Change
        </button>

        @if (resource(); as crew) {
          <div class="flex items-center gap-3">
            <vx-avatar size="lg" [name]="crew.driverName" />
            <div class="min-w-0">
              <p class="truncate text-base font-semibold text-ink">{{ crew.driverName }}</p>
              <div class="mt-1"><vx-status-badge [status]="crew.status" /></div>
              <p class="mt-1.5 text-meta text-ink-muted">
                From {{ date(crew.effectiveFrom) }}
                @if (crew.effectiveTo) {
                  until {{ date(crew.effectiveTo) }}
                }
              </p>
            </div>
          </div>
        } @else {
          <p class="text-body text-ink-muted">
            No driver assigned. Generated trips would have nobody to run them.
          </p>
        }
      </vx-section-card>

      <!-- Vehicle ----------------------------------------------------------------------------- -->
      <vx-section-card title="Assigned vehicle">
        <button
          header-actions
          type="button"
          class="vx-btn vx-btn-ghost vx-btn-sm"
          (click)="openTab.emit('crew')"
        >
          Change
        </button>

        @if (resource(); as crew) {
          <div class="flex items-start gap-3">
            <span
              class="flex size-11 flex-none items-center justify-center rounded-xl"
              style="background: var(--vexto-info-soft); color: var(--vexto-info-text)"
            >
              <vx-icon name="vehicle" [size]="22" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-base font-semibold text-ink">{{ crew.vehiclePlateNumber }}</p>
              <p class="mt-1 text-meta text-ink-muted">
                {{ capacity() !== null ? capacity() + ' seats' : 'Capacity unknown' }}
              </p>
              @if (overCapacity()) {
                <div class="mt-2">
                  <vx-attention-note level="warning">
                    {{ passengerCount() }} passengers assigned to {{ capacity() }} seats.
                  </vx-attention-note>
                </div>
              }
            </div>
          </div>
        } @else {
          <p class="text-body text-ink-muted">No vehicle assigned.</p>
        }
      </vx-section-card>

      <!-- Schedule ---------------------------------------------------------------------------- -->
      <vx-section-card title="Schedule">
        <button
          header-actions
          type="button"
          class="vx-btn vx-btn-ghost vx-btn-sm"
          (click)="openTab.emit('schedule')"
        >
          Edit
        </button>

        @if (schedules().length === 0) {
          <p class="text-body text-ink-muted">
            No schedule yet. Add the days this route departs before generating trips.
          </p>
        } @else {
          <p class="text-base font-semibold text-ink">{{ scheduleSummary() }}</p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (schedule of schedules(); track schedule.id) {
              <span
                class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-meta font-medium"
                style="background: var(--vexto-surface-muted); color: var(--vexto-text-secondary)"
              >
                <span class="font-semibold text-ink">{{ schedule.dayOfWeek.slice(0, 3) }}</span>
                {{ schedule.startTime.slice(0, 5) }}
              </span>
            }
          </div>
        }
      </vx-section-card>

      <!-- Next trip --------------------------------------------------------------------------- -->
      <vx-section-card title="Next trip">
        @if (nextTrip(); as trip) {
          <p class="text-lg font-semibold tracking-tight text-ink">
            {{ dayTime(trip.scheduledStartAtUtc) }}
          </p>
          <div class="mt-2"><vx-status-badge [status]="trip.status" /></div>
          <dl class="mt-4 grid grid-cols-2 gap-4">
            <vx-card-fact label="Driver" [value]="trip.driver?.name ?? 'Unassigned'" />
            <vx-card-fact label="Vehicle" [value]="trip.vehicle?.plateNumber ?? 'Unassigned'" />
          </dl>
          <a class="vx-btn vx-btn-secondary vx-btn-sm mt-4" [routerLink]="['/trips', trip.id]">
            Open trip
          </a>
        } @else {
          <p class="text-body text-ink-muted">
            No upcoming trips. Generate trips from the schedule to put this route on the road.
          </p>
        }
      </vx-section-card>

      <!-- Passengers -------------------------------------------------------------------------- -->
      <vx-section-card title="Passengers">
        <button
          header-actions
          type="button"
          class="vx-btn vx-btn-ghost vx-btn-sm"
          (click)="openTab.emit('passengers')"
        >
          Manage
        </button>

        <p class="text-[1.75rem] font-semibold leading-9 tracking-tight text-ink">
          {{ passengerCount() }}
        </p>
        <p class="mt-1 text-meta text-ink-muted">
          Assigned across {{ stopCount() }} {{ stopCount() === 1 ? 'stop' : 'stops' }}.
        </p>
        @if (blockedCount() > 0) {
          <div class="mt-3">
            <vx-attention-note level="warning">
              {{ blockedCount() }} assigned
              {{ blockedCount() === 1 ? 'passenger is' : 'passengers are' }} not currently active.
            </vx-attention-note>
          </div>
        }
      </vx-section-card>

      <!-- Route record ------------------------------------------------------------------------ -->
      <vx-section-card title="Route">
        @if (route(); as record) {
          <dl class="grid grid-cols-2 gap-4">
            <vx-card-fact label="Code" [value]="record.code" />
            <vx-card-fact label="Direction" [value]="record.direction" />
            <vx-card-fact
              label="Departs"
              [value]="record.defaultStartTime ? record.defaultStartTime.slice(0, 5) : '—'"
            />
            <vx-card-fact label="Created" [value]="date(record.createdAtUtc)" />
          </dl>
          @if (record.description) {
            <p class="mt-4 max-w-prose text-body text-ink-secondary">{{ record.description }}</p>
          }
        }
      </vx-section-card>
    </div>
  `,
})
export class RouteOverviewTab {
  private readonly store = inject(RouteWorkspaceStore);

  /** Lets a card send the operator to the tab that fixes what the card is reporting. */
  readonly openTab = output<string>();

  protected readonly date = formatDate;
  protected readonly time = formatTime;
  protected readonly dayTime = formatDayTime;

  protected readonly gaps = this.store.gaps;
  protected readonly resource = this.store.currentResource;
  protected readonly nextTrip = this.store.nextTrip;
  protected readonly schedules = this.store.activeSchedules;
  protected readonly overCapacity = this.store.overCapacity;

  protected readonly route = computed(() => this.store.detail()?.route ?? null);
  protected readonly capacity = computed(() => {
    const value = this.store.detail()?.summary.currentVehicleCapacity;

    return value === null || value === undefined ? null : Number(value);
  });

  protected readonly passengerCount = computed(() =>
    Number(this.store.detail()?.summary.activePassengerCount ?? 0),
  );
  protected readonly stopCount = computed(() =>
    Number(this.store.detail()?.summary.activeStopCount ?? 0),
  );

  /** Assignments that exist but are not active — a withdrawn or future-dated passenger. */
  protected readonly blockedCount = computed(
    () => this.store.passengers().filter((assignment) => assignment.status !== 'Active').length,
  );

  /**
   * `Mon–Fri · 06:00` when the pattern is regular, and the day count when it is not.
   *
   * Collapsing five identical entries into a range is the difference between a schedule somebody
   * reads and a schedule somebody counts. A route with different times per day is not collapsed,
   * because "Mon–Fri 06:00" would then be a lie about three of those days.
   */
  protected readonly scheduleSummary = computed(() => {
    const schedules = this.schedules();

    if (schedules.length === 0) {
      return 'No schedule';
    }

    const times = new Set(schedules.map((schedule) => schedule.startTime.slice(0, 5)));
    const days = schedules.map((schedule) => schedule.dayOfWeek.slice(0, 3));

    if (times.size > 1) {
      return `${schedules.length} departures each week`;
    }

    const time = [...times][0];
    const range =
      days.length > 1 && isContiguous(schedules.map((schedule) => schedule.dayOfWeek))
        ? `${days[0]}–${days[days.length - 1]}`
        : days.join(', ');

    return `${range} · ${time}`;
  });
}

const DAY_ORDER: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Whether the days form an unbroken run, which is what makes `Mon–Fri` truthful. */
function isContiguous(days: readonly string[]): boolean {
  const indexes = days.map((day) => DAY_ORDER.indexOf(day));

  return indexes.every((value, position) => position === 0 || value === indexes[position - 1]! + 1);
}
