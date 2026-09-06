import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TrackingApi, TripsApi, VextoApiError } from '@vexto/api-client';
import type { TripAttendance, TripDetailResponse, TripLocation } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxPageHeader,
  VxSectionCard,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate, formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/**
 * One trip: who is on it, where it is, and what a dispatcher can do about it.
 *
 * The controls change with the trip's state rather than being greyed out, because a dispatcher
 * scanning this page needs to see the *next* action, not an inventory of unavailable ones.
 */
@Component({
  selector: 'vexto-trip-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    VxAvatar,
    VxEmptyState,
    VxErrorState,
    VxIcon,
    VxPageHeader,
    VxSectionCard,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not load this trip" [message]="message" (retry)="load()" />
    } @else {
      <vx-page-header
        [title]="detail()?.trip?.route?.name ?? 'Trip'"
        [breadcrumbs]="[
          { label: 'Trips', link: '/trips' },
          { label: detail()?.trip?.route?.code ?? '' },
        ]"
      >
        <ng-container actions>
          @if (detail(); as loaded) {
            <ng-container *vxCan="manage">
              @switch (loaded.trip.status) {
                @case ('Scheduled') {
                  <button type="button" class="vx-btn vx-btn-secondary" (click)="markReady()">
                    <vx-icon name="check" [size]="16" />
                    Mark ready
                  </button>
                  <button type="button" class="vx-btn vx-btn-secondary" (click)="cancel()">
                    Cancel trip
                  </button>
                }
                @case ('Ready') {
                  <button type="button" class="vx-btn vx-btn-primary" (click)="start()">
                    Start trip
                  </button>
                  <button type="button" class="vx-btn vx-btn-secondary" (click)="cancel()">
                    Cancel trip
                  </button>
                }
                @case ('Started') {
                  <button type="button" class="vx-btn vx-btn-primary" (click)="complete()">
                    Complete trip
                  </button>
                }
              }
            </ng-container>
          }
        </ng-container>
      </vx-page-header>

      <section class="vx-card vx-card-pad mb-6">
        @if (loading()) {
          <vx-skeleton width="18rem" height="1.5rem" />
        } @else if (detail(); as loaded) {
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="text-lg font-semibold tracking-tight text-ink">
                  {{ loaded.trip.route.name }}
                </h2>
                <vx-status-badge [status]="loaded.trip.status" />
                @if (trackingBadge(); as tracking) {
                  <vx-status-badge
                    [tone]="tracking.tone"
                    [label]="tracking.label"
                    [icon]="tracking.tone === 'success' ? 'signal' : 'signal-off'"
                  />
                }
              </div>
              <p class="mt-1 text-meta text-ink-muted">
                {{ loaded.trip.route.code }} · {{ date(loaded.trip.serviceDate) }}
              </p>
            </div>

            <dl class="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <div>
                <dt class="vx-section-label">Departs</dt>
                <dd class="mt-1 text-body font-medium text-ink">
                  {{ time(loaded.trip.scheduledStartAtUtc) }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Driver</dt>
                <dd class="mt-1 text-body font-medium text-ink">
                  {{ loaded.trip.driver?.name ?? 'Unassigned' }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Vehicle</dt>
                <dd class="mt-1 text-body font-medium text-ink">
                  {{ loaded.trip.vehicle?.plateNumber ?? 'Unassigned' }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Passengers</dt>
                <dd class="mt-1 text-body font-medium text-ink">{{ loaded.trip.passengerCount }}</dd>
              </div>
            </dl>
          </div>

          @if (location(); as position) {
            <p class="mt-5 border-t border-line-subtle pt-4 text-meta text-ink-muted">
              Last position {{ relative(position.recordedAtUtc) }}.
            </p>
          }
        }
      </section>

      @if (attendance(); as summary) {
        <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (tile of attendanceTiles(); track tile.label) {
            <div class="vx-card vx-card-pad">
              <p class="vx-section-label">{{ tile.label }}</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ tile.value }}</p>
            </div>
          }
        </div>
      }

      <vx-section-card
        title="Manifest"
        description="Who is expected, and how the trip went for them."
        [padded]="false"
      >
        @if (loading()) {
          <div class="p-6"><vx-skeleton height="6rem" /></div>
        } @else if (passengers().length === 0) {
          <vx-empty-state
            icon="passengers"
            title="No passengers on this trip"
            description="Passengers come from the route's assignments at the time the trip was generated."
          />
        } @else {
          <div class="vx-table-scroll vx-scroll">
            <table class="vx-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Passenger</th>
                  <th scope="col">Stop</th>
                  <th scope="col">Status</th>
                  <th scope="col">Boarded</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (passenger of passengers(); track passenger.id) {
                  <tr>
                    <td class="text-ink-muted">
                      {{ passenger.sequence !== null ? passenger.sequence : '—' }}
                    </td>
                    <td>
                      <div class="flex items-center gap-3">
                        <vx-avatar size="sm" [name]="passenger.name" />
                        <span class="vx-cell-strong">{{ passenger.name }}</span>
                      </div>
                    </td>
                    <td>{{ passenger.stop ?? '—' }}</td>
                    <td><vx-status-badge [status]="passenger.status" /></td>
                    <td>{{ passenger.boardedAtUtc ? time(passenger.boardedAtUtc) : '—' }}</td>
                    <td class="text-end">
                      @if (canRecordAttendance() && passenger.status === 'Expected') {
                        <div class="flex justify-end gap-2">
                          <button
                            type="button"
                            class="vx-btn vx-btn-secondary vx-btn-sm"
                            (click)="board(passenger.id)"
                          >
                            Boarded
                          </button>
                          <button
                            type="button"
                            class="vx-btn vx-btn-ghost vx-btn-sm"
                            (click)="noShow(passenger.id)"
                          >
                            No show
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </vx-section-card>
    }
  `,
})
export class TripDetailPage {
  private readonly api = inject(TripsApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);

  readonly tripId = input.required<string>();

  protected readonly manage = VextoPermissions.Trips.Manage;
  protected readonly date = formatDate;
  protected readonly time = formatTime;
  protected readonly relative = formatRelative;

  protected readonly detail = signal<TripDetailResponse | null>(null);
  protected readonly attendance = signal<TripAttendance | null>(null);
  protected readonly location = signal<TripLocation | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Attendance from the dedicated endpoint when available, otherwise the trip's own manifest. */
  protected readonly passengers = computed(
    () => this.attendance()?.passengers ?? this.detail()?.passengers ?? [],
  );

  protected readonly canRecordAttendance = computed(
    () => this.permissions.has(VextoPermissions.Trips.Manage) && this.detail()?.trip.status === 'Started',
  );

  protected readonly attendanceTiles = computed(() => {
    const summary = this.attendance()?.summary;

    return summary
      ? [
          { label: 'Expected', value: summary.expected },
          { label: 'Boarded', value: summary.boarded },
          { label: 'No show', value: summary.noShow },
          { label: 'Dropped off', value: summary.droppedOff },
        ]
      : [];
  });

  /** Live, stale or offline — derived from the age of the fix, not just the server's own label. */
  protected readonly trackingBadge = computed(() => {
    const position = this.location();

    if (!position || !position.recordedAtUtc) {
      return null;
    }

    const age = secondsSince(position.recordedAtUtc);

    if (position.trackingStatus === 'Live' && age < 45) {
      return { tone: 'success' as const, label: 'Live' };
    }

    return position.trackingStatus === 'Completed'
      ? null
      : { tone: 'warning' as const, label: 'Stale' };
  });

  constructor() {
    effect(() => {
      this.tripId();
      this.load();
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.get(this.tripId()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load this trip.',
        );
      },
    });

    this.api.attendance(this.tripId()).subscribe({
      next: (attendance) => this.attendance.set(attendance),
      error: () => this.attendance.set(null),
    });

    // Tracking is a separate permission; a dispatcher without it simply sees no position line.
    if (this.permissions.has(VextoPermissions.Tracking.View)) {
      this.trackingApi.location(this.tripId()).subscribe({
        next: (position) => this.location.set(position),
        error: () => this.location.set(null),
      });
    }
  }

  protected markReady(): void {
    this.api.markReady(this.tripId()).subscribe({
      next: () => {
        this.toast.success('Trip marked ready.');
        this.load();
      },
      error: (error: unknown) => this.fail(error, 'We could not mark this trip ready.'),
    });
  }

  protected start(): void {
    this.api.start(this.tripId()).subscribe({
      next: () => {
        this.toast.success('Trip started.');
        this.load();
      },
      error: (error: unknown) => this.fail(error, 'We could not start this trip.'),
    });
  }

  protected complete(): void {
    this.api.complete(this.tripId()).subscribe({
      next: () => {
        this.toast.success('Trip completed.');
        this.load();
      },
      error: (error: unknown) => this.fail(error, 'We could not complete this trip.'),
    });
  }

  protected async cancel(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Cancel this trip?',
      message: 'Passengers will not be collected. This cannot be undone.',
      confirmLabel: 'Cancel trip',
      cancelLabel: 'Keep trip',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.cancel(this.tripId()).subscribe({
      next: () => {
        this.toast.success('Trip cancelled.');
        this.load();
      },
      error: (error: unknown) => this.fail(error, 'We could not cancel this trip.'),
    });
  }

  protected board(tripPassengerId: string): void {
    this.api.board(this.tripId(), tripPassengerId).subscribe({
      next: (attendance) => this.attendance.set(attendance),
      error: (error: unknown) => this.fail(error, 'We could not record that boarding.'),
    });
  }

  protected noShow(tripPassengerId: string): void {
    this.api.markNoShow(this.tripId(), tripPassengerId).subscribe({
      next: (attendance) => this.attendance.set(attendance),
      error: (error: unknown) => this.fail(error, 'We could not record that no-show.'),
    });
  }

  private fail(error: unknown, fallback: string): void {
    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
