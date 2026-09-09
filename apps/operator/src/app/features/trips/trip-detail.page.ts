import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TrackingApi, TripsApi, VextoApiError } from '@vexto/api-client';
import { type VxMapMarker, VxMap } from '@vexto/maps';
import type {
  OperatorManifestPassenger,
  TripActivity as TripActivityResponse,
  TripAttendance,
  TripDetailResponse,
  TripLocation,
} from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import { TrackingHub } from '@vexto/signalr';
import {
  ConfirmService,
  ToastService,
  type VxProgressSegment,
  VxAttentionNote,
  VxAvatar,
  VxCardFact,
  VxErrorState,
  VxIcon,
  VxPageHeader,
  VxProgressBar,
  VxSectionCard,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import {
  formatDate,
  formatDayLabel,
  formatDuration,
  formatRelative,
  formatTime,
  secondsSince,
} from '@vexto/utilities';
import { TripActivity } from './trip-activity';
import { TripCrewDrawer } from './trip-crew.drawer';
import { type ManifestRequest, TripManifest } from './trip-manifest';
import { TripPassengerDrawer } from './trip-passenger.drawer';

/**
 * One trip: who is on it, where it is, and what a dispatcher can do about it.
 *
 * **The layout follows the trip's state, because the question changes with it.** While a trip runs,
 * the only thing anybody wants is the map — where is the bus, is it moving, is it late — so the map
 * takes the top of the screen and the facts sit under it. Once the trip is finished the bus is
 * parked and a live map is a picture of nothing: the completed layout leads with what happened —
 * when it actually ran, how long it took, and how the attendance came out.
 *
 * The controls change with the state too rather than being greyed out: a dispatcher scanning this
 * page needs the *next* action, not an inventory of unavailable ones.
 */
@Component({
  selector: 'vexto-trip-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouterLink,
    TripActivity,
    TripCrewDrawer,
    TripManifest,
    TripPassengerDrawer,
    VxAttentionNote,
    VxAvatar,
    VxCardFact,
    VxErrorState,
    VxIcon,
    VxMap,
    VxPageHeader,
    VxProgressBar,
    VxSectionCard,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not load this trip" [message]="message" (retry)="load()" />
    } @else {
      <vx-page-header
        [title]="headerTitle()"
        [description]="headerDescription()"
        [breadcrumbs]="breadcrumbs()"
      >
        <ng-container actions>
          @if (detail(); as loaded) {
            <ng-container *vxCan="manage">
              @switch (loaded.trip.status) {
                @case ('Scheduled') {
                  <button type="button" class="vx-btn vx-btn-primary" (click)="markReady()">
                    <vx-icon name="check" [size]="16" />
                    Mark ready
                  </button>
                  <button type="button" class="vx-btn vx-btn-secondary" (click)="crewOpen.set(true)">
                    Change driver / vehicle
                  </button>
                  <button type="button" class="vx-btn vx-btn-ghost" (click)="cancel()">
                    Cancel trip
                  </button>
                }
                @case ('Ready') {
                  <button type="button" class="vx-btn vx-btn-primary" (click)="start()">
                    <vx-icon name="play" [size]="16" />
                    Start trip
                  </button>
                  <button type="button" class="vx-btn vx-btn-secondary" (click)="crewOpen.set(true)">
                    Change driver / vehicle
                  </button>
                  <button type="button" class="vx-btn vx-btn-ghost" (click)="cancel()">
                    Cancel trip
                  </button>
                }
                @case ('Started') {
                  <button type="button" class="vx-btn vx-btn-primary" (click)="complete()">
                    <vx-icon name="flag" [size]="16" />
                    Complete trip
                  </button>
                }
              }
            </ng-container>
          }
        </ng-container>
      </vx-page-header>

      @if (loading()) {
        <div class="flex flex-col gap-6">
          <div class="vx-skeleton h-[22rem] w-full rounded-2xl"></div>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            @for (tile of [0, 1, 2, 3]; track tile) {
              <div class="vx-card vx-card-pad"><vx-skeleton height="3rem" /></div>
            }
          </div>
          <div class="vx-card p-5"><vx-skeleton height="12rem" /></div>
        </div>
      } @else if (detail(); as loaded) {
        <!--
          Live layout: the map dominates. Section 10 of the operations brief, and the reason is that
          a running trip is a question about a moving object.
        -->
        @if (isLive()) {
          <section class="mb-6">
            <div class="h-[24rem] w-full lg:h-[28rem]">
              <vx-map [markers]="busMarkers()" [center]="busCentre()" [zoom]="14" />
            </div>
            @if (trackingNote(); as note) {
              <div class="mt-3">
                <vx-attention-note [level]="note.level">{{ note.message }}</vx-attention-note>
              </div>
            }
          </section>
        }

        <!-- Fact row: attendance, driver, vehicle, tracking ------------------------------------ -->
        <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="vx-card vx-card-pad">
            <p class="vx-section-label">Attendance</p>
            @if (attendance(); as summary) {
              <p class="mt-1.5 text-[1.75rem] font-semibold leading-9 tabular-nums text-ink">
                {{ summary.summary.boarded }} / {{ summary.summary.total }}
              </p>
              <p class="mt-0.5 text-meta text-ink-muted">boarded</p>
            } @else {
              <p class="mt-1.5 text-[1.75rem] font-semibold leading-9 tabular-nums text-ink">
                {{ loaded.trip.passengerCount }}
              </p>
              <p class="mt-0.5 text-meta text-ink-muted">expected</p>
            }
          </div>

          <div class="vx-card vx-card-pad">
            <p class="vx-section-label">Driver</p>
            <div class="mt-2 flex items-center gap-2.5">
              <vx-avatar size="sm" [name]="loaded.trip.driver?.name ?? null" />
              <p class="min-w-0 truncate text-body font-medium text-ink">
                {{ loaded.trip.driver?.name ?? 'Unassigned' }}
              </p>
            </div>
          </div>

          <div class="vx-card vx-card-pad">
            <p class="vx-section-label">Vehicle</p>
            <p class="mt-2 truncate text-body font-medium text-ink">
              {{ loaded.trip.vehicle?.plateNumber ?? 'Unassigned' }}
            </p>
          </div>

          <div class="vx-card vx-card-pad">
            <p class="vx-section-label">Tracking</p>
            <div class="mt-2">
              @if (trackingBadge(); as tracking) {
                <vx-status-badge
                  [tone]="tracking.tone"
                  [label]="tracking.label"
                  [icon]="tracking.tone === 'success' ? 'signal' : 'signal-off'"
                />
              } @else {
                <span class="text-body text-ink-muted">Not reporting</span>
              }
            </div>
            @if (location(); as position) {
              <p class="mt-1.5 text-meta text-ink-muted">
                Last position {{ relative(position.recordedAtUtc) }}
              </p>
            }
          </div>
        </div>

        <!-- Completed summary: what actually happened ------------------------------------------- -->
        @if (isFinished()) {
          <div class="mb-6 grid gap-4 lg:grid-cols-2">
            <vx-section-card title="How it ran">
              <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <vx-card-fact label="Scheduled" [value]="time(loaded.trip.scheduledStartAtUtc)" />
                <vx-card-fact
                  label="Actual start"
                  [value]="
                    loaded.trip.actualStartAtUtc ? time(loaded.trip.actualStartAtUtc) : 'Never started'
                  "
                />
                <vx-card-fact
                  label="Completed"
                  [value]="loaded.trip.actualEndAtUtc ? time(loaded.trip.actualEndAtUtc) : '—'"
                />
                <vx-card-fact label="Duration" [value]="duration()" />
                <vx-card-fact label="Driver" [value]="loaded.trip.driver?.name ?? 'Unassigned'" />
                <vx-card-fact
                  label="Vehicle"
                  [value]="loaded.trip.vehicle?.plateNumber ?? 'Unassigned'"
                />
              </dl>
            </vx-section-card>

            <vx-section-card title="Attendance summary">
              @if (segments().length > 0) {
                <vx-progress-bar
                  [segments]="segments()"
                  [headline]="attendanceHeadline()"
                  caption="Every expected passenger, in one state."
                />
              } @else {
                <p class="text-body text-ink-muted">Nothing was recorded for this trip.</p>
              }
            </vx-section-card>
          </div>
        } @else if (segments().length > 0) {
          <section class="vx-card vx-card-pad mb-6">
            <vx-progress-bar
              [segments]="segments()"
              [headline]="attendanceHeadline()"
              [caption]="remainingCaption()"
            />
          </section>
        }

        <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <vx-section-card
            title="Passenger manifest"
            description="In the order the driver meets them."
            [padded]="false"
          >
            <a
              header-actions
              class="vx-btn vx-btn-ghost vx-btn-sm"
              [routerLink]="['/routes', loaded.trip.route.id]"
            >
              Open route
              <vx-icon name="chevron-right" [size]="15" />
            </a>

            <vexto-trip-manifest
              [passengers]="passengers()"
              [editable]="canRecordAttendance()"
              (record)="onRecord($event)"
              (opened)="selectedPassenger.set($event)"
            />
          </vx-section-card>

          <vx-section-card
            title="Activity"
            description="Recorded events for this trip."
            [padded]="false"
          >
            <vexto-trip-activity
              [events]="activity()?.items ?? []"
              [hasMore]="activity()?.hasMore ?? false"
              [loading]="activityLoading()"
            />
          </vx-section-card>
        </div>

        <vexto-trip-crew-drawer
          [open]="crewOpen()"
          [trip]="loaded.trip"
          (dismissed)="crewOpen.set(false)"
          (changed)="onCrewChanged()"
        />

        <vexto-trip-passenger-drawer
          [open]="selectedPassenger() !== null"
          [passenger]="selectedPassenger()"
          (dismissed)="selectedPassenger.set(null)"
        />
      }
    }
  `,
})
export class TripDetailPage {
  private readonly api = inject(TripsApi);
  private readonly trackingApi = inject(TrackingApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionService);
  private readonly hub = inject(TrackingHub);
  private readonly destroyRef = inject(DestroyRef);

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
  protected readonly crewOpen = signal(false);
  protected readonly selectedPassenger = signal<OperatorManifestPassenger | null>(null);

  protected readonly manifest = signal<readonly OperatorManifestPassenger[]>([]);
  protected readonly activity = signal<TripActivityResponse | null>(null);
  protected readonly activityLoading = signal(true);

  /**
   * The enriched manifest.
   *
   * Photo availability and transport access come from the composed manifest endpoint; the plain
   * trip detail cannot answer either, because Trips is a leaf module. Until that call lands the
   * rows are projected from the trip's own manifest with a neutral access state, so the list
   * appears immediately rather than flashing empty — and never claims somebody is blocked before
   * anything has said so.
   */
  protected readonly passengers = computed<readonly OperatorManifestPassenger[]>(() => {
    const enriched = this.manifest();

    if (enriched.length > 0) {
      return enriched;
    }

    const rows = this.attendance()?.passengers ?? this.detail()?.passengers ?? [];

    return rows.map((row) => ({ ...row, accessState: 'Active', hasPhoto: false }));
  });

  protected readonly isLive = computed(() => this.detail()?.trip.status === 'Started');
  protected readonly isFinished = computed(() => {
    const status = this.detail()?.trip.status;

    return status === 'Completed' || status === 'Cancelled';
  });

  protected readonly headerTitle = computed(() => {
    const trip = this.detail()?.trip;

    return trip ? `${formatTime(trip.scheduledStartAtUtc)} · ${trip.route.name}` : 'Trip';
  });

  protected readonly headerDescription = computed(() => {
    const trip = this.detail()?.trip;

    return trip ? `${trip.route.code} · ${formatDayLabel(trip.serviceDate)}` : null;
  });

  protected readonly breadcrumbs = computed(() => {
    const trip = this.detail()?.trip;

    return trip
      ? [
          { label: 'Routes', link: '/routes' },
          { label: trip.route.name, link: `/routes/${trip.route.id}` },
          { label: `${formatDayLabel(trip.serviceDate)} ${formatTime(trip.scheduledStartAtUtc)}` },
        ]
      : [{ label: 'Trips', link: '/trips' }, { label: 'Trip' }];
  });

  protected readonly duration = computed(() => {
    const trip = this.detail()?.trip;

    return trip ? formatDuration(trip.actualStartAtUtc, trip.actualEndAtUtc) : '—';
  });

  /**
   * Attendance as one bar.
   *
   * Zero-value states are dropped by the bar itself, so a trip where nobody was blocked does not
   * carry "0 blocked" on it — which is noise that makes the one trip with a blocked passenger
   * harder to spot.
   */
  protected readonly segments = computed<readonly VxProgressSegment[]>(() => {
    const summary = this.attendance()?.summary;

    return summary
      ? [
          { label: 'boarded', value: Number(summary.boarded), tone: 'success' as const },
          { label: 'dropped off', value: Number(summary.droppedOff), tone: 'info' as const },
          { label: 'expected', value: Number(summary.expected), tone: 'neutral' as const },
          { label: 'skipped', value: Number(summary.skipped), tone: 'warning' as const },
          { label: 'no show', value: Number(summary.noShow), tone: 'danger' as const },
        ]
      : [];
  });

  protected readonly attendanceHeadline = computed(() => {
    const summary = this.attendance()?.summary;

    return summary ? `${summary.boarded} / ${summary.total} boarded` : null;
  });

  protected readonly remainingCaption = computed(() => {
    const summary = this.attendance()?.summary;

    return summary ? `${summary.expected} still expected` : null;
  });

  protected readonly canRecordAttendance = computed(
    () =>
      this.permissions.has(VextoPermissions.Trips.Manage) &&
      this.detail()?.trip.status === 'Started',
  );

  /** The bus, as one pin. Tinted by how much the last fix can be trusted. */
  protected readonly busMarkers = computed<VxMapMarker[]>(() => {
    const position = this.location();
    const trip = this.detail()?.trip;

    if (!position || position.latitude === null || position.longitude === null) {
      return [];
    }

    return [
      {
        id: position.tripId,
        lat: Number(position.latitude),
        lng: Number(position.longitude),
        label: trip?.vehicle?.plateNumber ?? 'Vehicle',
        tone: this.trackingBadge()?.tone === 'success' ? 'success' : 'warning',
        heading: position.headingDegrees === null ? null : Number(position.headingDegrees),
      },
    ];
  });

  protected readonly busCentre = computed(() => {
    const marker = this.busMarkers()[0];

    return marker ? { lat: marker.lat, lng: marker.lng } : null;
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

  /**
   * The sentence under the live map.
   *
   * A running trip with no position is the case worth saying out loud: the map is empty and without
   * this note it reads as a broken map rather than as a driver whose phone has stopped reporting.
   */
  protected readonly trackingNote = computed(() => {
    if (!this.isLive()) {
      return null;
    }

    const position = this.location();

    if (!position || position.latitude === null) {
      return {
        level: 'warning' as const,
        message:
          'This trip is running but no live location is being reported. The driver’s app may have location sharing switched off.',
      };
    }

    return this.trackingBadge()?.tone === 'success'
      ? null
      : {
          level: 'warning' as const,
          message: `Live location is stale — the last fix arrived ${formatRelative(position.recordedAtUtc)}.`,
        };
  });

  constructor() {
    effect(() => {
      this.tripId();
      this.load();
    });

    // One socket, one trip. Watching gives the map a moving bus instead of a position that only
    // updates when somebody reloads the page.
    effect(() => {
      const tripId = this.tripId();

      if (!this.isLive() || !this.permissions.has(VextoPermissions.Tracking.View)) {
        return;
      }

      void this.hub.start().then(() => void this.hub.watchTrip(tripId));
    });

    this.hub.updates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((update) => {
      if (update.tripId !== this.tripId()) {
        return;
      }

      this.location.set({ ...(this.location() ?? {}), ...update } as TripLocation);
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

    this.api.manifest(this.tripId()).subscribe({
      next: (manifest) => this.manifest.set(manifest.passengers),

      // A failure here leaves the plain manifest showing. Losing the photos and access badges is a
      // degraded screen; losing the passenger list would be a broken one.
      error: () => this.manifest.set([]),
    });

    this.activityLoading.set(true);

    this.api.activity(this.tripId()).subscribe({
      next: (activity) => {
        this.activity.set(activity);
        this.activityLoading.set(false);
      },
      error: () => {
        this.activity.set(null);
        this.activityLoading.set(false);
      },
    });

    // Tracking is a separate permission; a dispatcher without it simply sees no position.
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

  protected onRecord(request: ManifestRequest): void {
    const call =
      request.action === 'board'
        ? this.api.board(this.tripId(), request.tripPassengerId)
        : request.action === 'no-show'
          ? this.api.markNoShow(this.tripId(), request.tripPassengerId)
          : this.api.dropOff(this.tripId(), request.tripPassengerId);

    call.subscribe({
      // Reloading rather than patching the row: recording attendance also writes an activity event,
      // and a timeline that only caught up on a page refresh would look like it had missed things.
      next: () => this.load(),
      error: (error: unknown) => this.fail(error, 'We could not record that.'),
    });
  }

  protected onCrewChanged(): void {
    this.crewOpen.set(false);
    this.load();
  }

  private fail(error: unknown, fallback: string): void {
    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
