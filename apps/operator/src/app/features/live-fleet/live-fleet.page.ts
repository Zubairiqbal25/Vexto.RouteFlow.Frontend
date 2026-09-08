import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TrackingApi, VextoApiError } from '@vexto/api-client';
import { VxMap, type VxMapMarker } from '@vexto/maps';
import type { ActiveFleetTrip } from '@vexto/models';
import { TrackingHub } from '@vexto/signalr';
import {
  VxEmptyState,
  VxErrorState,
  type VxFilterChip,
  VxFilterChips,
  VxIcon,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { VEXTO_CONFIG, formatRelative, formatTime, secondsSince } from '@vexto/utilities';

/** How a bus is reporting. `offline` means it started and has said nothing at all. */
type FleetSignal = 'live' | 'stale' | 'offline';

/**
 * Where every bus is, right now.
 *
 * **The map is the screen and the panel is the index.** Roughly three-quarters of the width goes to
 * the map, because a dispatcher's question here is spatial — which of my buses is where, and is
 * anything stuck. The panel exists to find a specific one and to say the things a pin cannot.
 *
 * **Selection is bidirectional and single.** Clicking a card selects the trip, highlights its pin
 * and pans to it; clicking a pin selects the card and scrolls it into view. There is one selection,
 * so the two can never disagree about what is being looked at.
 *
 * One HTTP call establishes the picture; SignalR keeps it moving. Positions are merged into the
 * existing rows rather than triggering a refetch — a refetch per update would be a request every
 * few seconds per vehicle.
 *
 * "Live" is decided from the age of the last fix, not from the server's label: a connection that
 * quietly died leaves a status of `Live` attached to a position that is minutes old, and a
 * dispatcher acting on that is the failure this guards against.
 */
@Component({
  selector: 'vexto-live-fleet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    VxEmptyState,
    VxErrorState,
    VxFilterChips,
    VxIcon,
    VxMap,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Live Fleet</h1>
        <p class="mt-1 text-body text-ink-muted">
          Vehicles currently on the road, updated as their drivers report position.
        </p>
      </div>

      <span class="vx-badge" [class]="'vx-tone-' + connectionTone()">
        <vx-icon [name]="connected() ? 'signal' : 'signal-off'" [size]="14" />
        {{ connectionLabel() }}
      </span>
    </div>

    @if (error(); as message) {
      <vx-error-state title="We could not load the fleet" [message]="message" (retry)="load()" />
    } @else {
      <!--
        Map first in the DOM as well as on screen. At tablet width the columns collapse and the map
        keeps its height above the list, which is the order the question is asked in.
      -->
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          class="vx-card overflow-hidden"
          style="min-height: 26rem; height: clamp(26rem, calc(100vh - 15rem), 46rem)"
        >
          <vx-map
            class="block size-full"
            [markers]="markers()"
            [center]="focusPoint()"
            (markerSelected)="selectFromMap($event)"
          />
        </div>

        <aside
          class="vx-card flex flex-col overflow-hidden"
          style="max-height: clamp(26rem, calc(100vh - 15rem), 46rem)"
          aria-label="Active fleet"
        >
          <div class="flex-none border-b border-line-subtle p-4">
            <div class="relative">
              <span
                class="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-muted"
              >
                <vx-icon name="search" [size]="15" />
              </span>
              <input
                type="search"
                class="vx-input ps-8"
                placeholder="Search route, plate or driver"
                aria-label="Search the active fleet"
                [value]="search()"
                (input)="onSearch($event)"
              />
            </div>

            <div class="mt-3">
              <vx-filter-chips
                label="Tracking state"
                [chips]="signalChips()"
                [active]="activeSignals()"
                (toggled)="toggleSignal($event)"
                (cleared)="activeSignals.set([])"
              />
            </div>
          </div>

          @if (loading()) {
            <div class="flex flex-col gap-3 p-4">
              @for (row of [0, 1, 2, 3]; track row) {
                <vx-skeleton height="4.5rem" />
              }
            </div>
          } @else if (trips().length === 0) {
            <vx-empty-state
              icon="live"
              title="Nothing running"
              description="Vehicles appear here once a driver starts their trip."
            />
          } @else if (visible().length === 0) {
            <vx-empty-state
              icon="filter"
              title="Nothing matches"
              description="Clear the search or a tracking filter to see the rest of the fleet."
            />
          } @else {
            <div #list class="vx-scroll min-h-0 flex-1 overflow-y-auto">
              @for (group of groups(); track group.key) {
                <p
                  class="vx-section-label sticky top-0 z-10 px-4 py-2"
                  style="background: var(--vexto-surface-muted)"
                >
                  {{ group.label }} · {{ group.trips.length }}
                </p>

                <ul class="divide-y divide-line-subtle">
                  @for (trip of group.trips; track trip.tripId) {
                    <li>
                      <button
                        type="button"
                        [attr.data-trip]="trip.tripId"
                        class="flex w-full flex-col gap-1.5 border-s-2 px-4 py-3.5 text-start
                               transition-colors hover:bg-surface-hover"
                        [style.border-inline-start-color]="
                          trip.tripId === selected() ? 'var(--vexto-primary)' : 'transparent'
                        "
                        [style.background]="
                          trip.tripId === selected() ? 'var(--vexto-primary-soft)' : null
                        "
                        [attr.aria-current]="trip.tripId === selected()"
                        (click)="select(trip.tripId, true)"
                      >
                        <span class="flex items-center justify-between gap-3">
                          <span class="truncate font-medium text-ink">
                            {{ trip.plateNumber ?? 'Unassigned vehicle' }}
                          </span>
                          <vx-status-badge
                            [tone]="badgeTone(trip)"
                            [label]="label(trip)"
                            [icon]="signalOf(trip) === 'live' ? 'signal' : 'signal-off'"
                          />
                        </span>

                        <span class="truncate text-meta text-ink-muted">
                          {{ trip.routeCode }} · {{ trip.routeName }}
                        </span>

                        <span class="truncate text-meta text-ink-muted">
                          {{ trip.driverName ?? 'No driver' }} ·
                          {{
                            trip.tracking.recordedAtUtc
                              ? relative(trip.tracking.recordedAtUtc)
                              : 'no position yet'
                          }}
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>

            @if (selectedTrip(); as trip) {
              <div class="flex-none border-t border-line-subtle p-4">
                <p class="vx-section-label">Selected</p>
                <p class="mt-1 truncate font-medium text-ink">{{ trip.routeName }}</p>
                <p class="text-meta text-ink-muted">
                  {{ trip.plateNumber ?? 'No vehicle' }} ·
                  {{
                    trip.tracking.recordedAtUtc
                      ? 'reported ' + time(trip.tracking.recordedAtUtc)
                      : 'no position yet'
                  }}
                </p>
                <button
                  type="button"
                  class="vx-btn vx-btn-primary vx-btn-sm mt-3 w-full"
                  (click)="openTrip(trip)"
                >
                  Open trip
                </button>
              </div>
            }
          }
        </aside>
      </div>
    }
  `,
})
export class LiveFleetPage {
  private readonly api = inject(TrackingApi);
  private readonly hub = inject(TrackingHub);
  private readonly router = inject(Router);
  private readonly staleAfter = inject(VEXTO_CONFIG).staleLocationAfterSeconds;
  private readonly listElement = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly relative = formatRelative;
  protected readonly time = formatTime;

  protected readonly trips = signal<ActiveFleetTrip[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly activeSignals = signal<readonly string[]>([]);

  /** Set only when the map should move. Clicking a pin leaves the view where the user put it. */
  protected readonly focusPoint = signal<{ lat: number; lng: number } | null>(null);

  protected readonly connected = computed(() => this.hub.status() === 'connected');

  protected readonly connectionLabel = computed(
    () =>
      ({
        connected: 'Connected',
        connecting: 'Connecting…',
        reconnecting: 'Reconnecting…',
        disconnected: 'Offline',
      })[this.hub.status()],
  );

  protected readonly connectionTone = computed(
    () =>
      ({
        connected: 'success',
        connecting: 'warning',
        reconnecting: 'warning',
        disconnected: 'danger',
      })[this.hub.status()],
  );

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const states = this.activeSignals();

    return this.trips().filter((trip) => {
      if (states.length > 0 && !states.includes(this.signalOf(trip))) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [trip.routeCode, trip.routeName, trip.plateNumber, trip.driverName]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(term));
    });
  });

  /**
   * Buses that need looking at, then the ones that are fine.
   *
   * A stale or silent bus is the only thing on this screen that asks for a decision, and burying it
   * alphabetically among twenty healthy ones is how it gets missed. When nothing needs attention the
   * group disappears rather than showing an empty heading.
   */
  protected readonly groups = computed(() => {
    const attention = this.visible().filter((trip) => this.signalOf(trip) !== 'live');
    const live = this.visible().filter((trip) => this.signalOf(trip) === 'live');

    return [
      { key: 'attention', label: 'Needs attention', trips: attention },
      { key: 'live', label: 'Reporting normally', trips: live },
    ].filter((group) => group.trips.length > 0);
  });

  protected readonly signalChips = computed<VxFilterChip[]>(() => {
    const counts = { live: 0, stale: 0, offline: 0 };

    for (const trip of this.trips()) {
      counts[this.signalOf(trip)] += 1;
    }

    return (['live', 'stale', 'offline'] as const)
      .filter((state) => counts[state] > 0)
      .map((state) => ({
        id: state,
        label: { live: 'Live', stale: 'Stale', offline: 'No signal' }[state],
        count: counts[state],
      }));
  });

  protected readonly selectedTrip = computed(
    () => this.trips().find((trip) => trip.tripId === this.selected()) ?? null,
  );

  protected readonly markers = computed<VxMapMarker[]>(() =>
    this.visible()
      .filter(
        (trip): trip is ActiveFleetTrip & { tracking: { latitude: number; longitude: number } } =>
          trip.tracking.latitude !== null && trip.tracking.longitude !== null,
      )
      .map((trip) => ({
        id: trip.tripId,
        lat: trip.tracking.latitude,
        lng: trip.tracking.longitude,
        label: `${trip.plateNumber ?? 'Vehicle'} · ${trip.routeCode}`,
        tone: this.markerTone(trip),
        heading: trip.tracking.headingDegrees,
        selected: trip.tripId === this.selected(),
      })),
  );

  constructor() {
    this.load();
    void this.hub.start();

    this.hub.updates.pipe(takeUntilDestroyed()).subscribe((update) => {
      this.trips.update((current) =>
        current.map((trip) =>
          trip.tripId === update.tripId
            ? {
                ...trip,
                tracking: {
                  ...trip.tracking,
                  latitude: update.latitude,
                  longitude: update.longitude,
                  speedKph: update.speedKph,
                  headingDegrees: update.headingDegrees,
                  recordedAtUtc: update.recordedAtUtc,
                  trackingStatus: update.trackingStatus,
                },
              }
            : trip,
        ),
      );

      // A trip that starts while the page is open is not in the list yet; refresh to pick it up.
      if (!this.trips().some((trip) => trip.tripId === update.tripId)) {
        this.load();
      }
    });

    // Keeps the chosen card in view when the selection came from the map. Without this, clicking a
    // pin highlights a row that may be forty rows down a scrolling panel.
    effect(() => {
      const tripId = this.selected();
      const list = this.listElement()?.nativeElement;

      if (!tripId || !list) {
        return;
      }

      const row = list.querySelector<HTMLElement>(`[data-trip="${tripId}"]`);

      row?.scrollIntoView({ block: 'nearest', behavior: this.scrollBehaviour() });
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.activeFleet().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load the live fleet.',
        );
      },
    });
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected toggleSignal(id: string): void {
    this.activeSignals.update((active) =>
      active.includes(id) ? active.filter((value) => value !== id) : [...active, id],
    );
  }

  /**
   * Live, stale, or reporting nothing at all.
   *
   * The third state matters: a trip that has started and never sent a position looks identical to a
   * healthy one in any model that only has "live or not", and it is the one a dispatcher most needs
   * to chase.
   */
  protected signalOf(trip: ActiveFleetTrip): FleetSignal {
    if (!trip.tracking.recordedAtUtc) {
      return 'offline';
    }

    return secondsSince(trip.tracking.recordedAtUtc) <= this.staleAfter ? 'live' : 'stale';
  }

  protected badgeTone(trip: ActiveFleetTrip): 'success' | 'warning' | 'danger' {
    const state = this.signalOf(trip);

    return state === 'live' ? 'success' : state === 'stale' ? 'warning' : 'danger';
  }

  protected label(trip: ActiveFleetTrip): string {
    return { live: 'Live', stale: 'Stale', offline: 'No signal' }[this.signalOf(trip)];
  }

  private markerTone(trip: ActiveFleetTrip): 'success' | 'warning' | 'danger' {
    return this.badgeTone(trip);
  }

  /**
   * Selects a trip, and moves the map only when asked.
   *
   * `pan` is true from the list — the user pointed at a row and expects the map to follow — and
   * false from the map itself, where panning to a pin the user just clicked would yank the view they
   * were already looking at.
   */
  protected select(tripId: string, pan: boolean): void {
    this.selected.set(tripId);

    if (!pan) {
      return;
    }

    const tracking = this.trips().find((candidate) => candidate.tripId === tripId)?.tracking;

    if (tracking?.latitude != null && tracking.longitude != null) {
      this.focusPoint.set({ lat: tracking.latitude, lng: tracking.longitude });
    }
  }

  protected selectFromMap(tripId: string): void {
    this.select(tripId, false);
  }

  protected openTrip(trip: ActiveFleetTrip): void {
    void this.router.navigate(['/trips', trip.tripId]);
  }

  /** Honours the OS setting; a panel that jumps is better than one that slides for somebody who asked it not to. */
  private scrollBehaviour(): ScrollBehavior {
    return typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
  }
}
