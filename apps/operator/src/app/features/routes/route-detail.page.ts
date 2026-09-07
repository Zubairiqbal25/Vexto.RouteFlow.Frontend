import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { RoutesApi, TripsApi, VextoApiError } from '@vexto/api-client';
import { type VxMapMarker, VxMap } from '@vexto/maps';
import type { RouteDetailResponse, RouteMapPreview, TripResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ToastService,
  type VxTab,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxPageHeader,
  VxSectionCard,
  VxSkeleton,
  VxStatusBadge,
  VxTabs,
} from '@vexto/ui';
import { formatDate, formatDateTime } from '@vexto/utilities';
import { RouteForm } from './route-form';
import { RoutePassengersTab } from './route-passengers.tab';
import { RouteResourcesTab } from './route-resources.tab';
import { RouteScheduleTab } from './route-schedule.tab';
import { RouteStopsTab } from './route-stops.tab';

type TabId = 'overview' | 'map' | 'stops' | 'passengers' | 'resources' | 'schedule' | 'trips';

/**
 * Everything about one route.
 *
 * The header answers the three questions a planner has on arrival — what is this route, is it
 * running, and how big is it — before any tab is opened. Counts come from the detail response, so
 * the header costs one request rather than one per tab.
 */
@Component({
  selector: 'vexto-route-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouteForm,
    RoutePassengersTab,
    RouteResourcesTab,
    RouteScheduleTab,
    RouteStopsTab,
    RouterLink,
    VxEmptyState,
    VxErrorState,
    VxIcon,
    VxPageHeader,
    VxSectionCard,
    VxSkeleton,
    VxStatusBadge,
    VxTabs,
    VxMap,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not load this route" [message]="message" (retry)="load()" />
    } @else {
      <vx-page-header
        [title]="detail()?.route?.name ?? 'Route'"
        [breadcrumbs]="[{ label: 'Routes', link: '/routes' }, { label: detail()?.route?.code ?? '' }]"
      >
        <ng-container actions>
          @if (detail(); as loaded) {
            <a
              *vxCan="viewTrips"
              class="vx-btn vx-btn-secondary"
              [routerLink]="['/trips']"
              [queryParams]="{ routeId: loaded.route.id }"
            >
              <vx-icon name="trips" [size]="16" />
              View trips
            </a>
            <!--
              A route is created as a draft and cannot generate trips until it is in service. Without
              this control a route built in the portal is a dead end: everything about it can be
              configured and none of it will ever produce a journey.
            -->
            @if (loaded.route.status === 'Active') {
              <button
                *vxCan="manage"
                type="button"
                class="vx-btn vx-btn-secondary"
                [disabled]="changingStatus()"
                (click)="deactivate()"
              >
                Take out of service
              </button>
            } @else {
              <button
                *vxCan="manage"
                type="button"
                class="vx-btn vx-btn-secondary"
                [disabled]="changingStatus()"
                (click)="activate()"
              >
                <vx-icon name="check" [size]="16" />
                Activate route
              </button>
            }

            <button
              *vxCan="manage"
              type="button"
              class="vx-btn vx-btn-primary"
              (click)="editOpen.set(true)"
            >
              <vx-icon name="edit" [size]="16" />
              Edit Route
            </button>
          }
        </ng-container>
      </vx-page-header>

      <section class="vx-card vx-card-pad mb-6">
        @if (loading()) {
          <div class="flex flex-col gap-3">
            <vx-skeleton width="14rem" height="1.5rem" />
            <vx-skeleton width="22rem" height="1rem" />
          </div>
        } @else if (detail(); as loaded) {
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="text-lg font-semibold tracking-tight text-ink">{{ loaded.route.name }}</h2>
                <vx-status-badge [status]="loaded.route.status" />
              </div>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-meta text-ink-muted">
                <span class="font-medium text-ink-secondary">{{ loaded.route.code }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ loaded.route.direction }}</span>
                @if (loaded.route.defaultStartTime) {
                  <span aria-hidden="true">·</span>
                  <span>Departs {{ loaded.route.defaultStartTime.slice(0, 5) }}</span>
                }
              </p>
              @if (loaded.route.description) {
                <p class="mt-3 max-w-prose text-body text-ink-secondary">
                  {{ loaded.route.description }}
                </p>
              }
            </div>

            <dl class="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <div>
                <dt class="vx-section-label">Stops</dt>
                <dd class="mt-1 text-xl font-semibold text-ink">
                  {{ loaded.summary.activeStopCount }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Passengers</dt>
                <dd class="mt-1 text-xl font-semibold text-ink">
                  {{ loaded.summary.activePassengerCount }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Driver</dt>
                <dd class="mt-1 truncate text-body font-medium text-ink">
                  {{ loaded.summary.currentDriverName ?? 'Unassigned' }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Vehicle</dt>
                <dd class="mt-1 truncate text-body font-medium text-ink">
                  {{ loaded.summary.currentVehiclePlateNumber ?? 'Unassigned' }}
                </dd>
              </div>
            </dl>
          </div>
        }
      </section>

      <vx-tabs [tabs]="tabs()" [active]="tab()" label="Route sections" (selected)="select($event)" />

      <div class="mt-6">
        @switch (tab()) {
          @case ('overview') {
            <vx-section-card title="Overview" description="A summary of how this route is set up.">
              @if (detail(); as loaded) {
                <dl class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <div>
                    <dt class="vx-section-label">Code</dt>
                    <dd class="mt-1 text-body text-ink">{{ loaded.route.code }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Direction</dt>
                    <dd class="mt-1 text-body text-ink">{{ loaded.route.direction }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Active schedules</dt>
                    <dd class="mt-1 text-body text-ink">{{ loaded.summary.activeScheduleCount }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Vehicle capacity</dt>
                    <dd class="mt-1 text-body text-ink">
                      @if (loaded.summary.currentVehicleCapacity !== null) {
                        {{ loaded.summary.currentVehicleCapacity }} seats
                        @if (overCapacity()) {
                          <span class="ms-2">
                            <vx-status-badge tone="warning" icon="alert" label="Over capacity" />
                          </span>
                        }
                      } @else {
                        No vehicle assigned
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Created</dt>
                    <dd class="mt-1 text-body text-ink">{{ date(loaded.route.createdAtUtc) }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Last updated</dt>
                    <dd class="mt-1 text-body text-ink">
                      {{ loaded.route.updatedAtUtc ? dateTime(loaded.route.updatedAtUtc) : '—' }}
                    </dd>
                  </div>
                </dl>
              }
            </vx-section-card>
          }
          @case ('map') {
            <vx-section-card
              title="Route map"
              description="The stops in the order you planned them, and the road between them."
            >
              @if (preview(); as drawn) {
                <div class="mb-4 flex flex-wrap gap-6">
                  <div>
                    <dt class="vx-section-label">Stops</dt>
                    <dd class="mt-1 text-body text-ink">{{ drawn.stops.length }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Distance</dt>
                    <dd class="mt-1 text-body text-ink">{{ distance() }}</dd>
                  </div>
                  <div>
                    <dt class="vx-section-label">Driving time</dt>
                    <dd class="mt-1 text-body text-ink">{{ duration() }}</dd>
                  </div>
                </div>

                @if (drawn.stops.length === 0) {
                  <p class="text-body text-ink-muted">
                    This route has no active stops yet, so there is nothing to draw. Add stops on
                    the Stops tab.
                  </p>
                } @else {
                  <div class="h-[26rem] w-full">
                    <vx-map
                      [markers]="stopMarkers()"
                      [polyline]="drawn.polyline"
                      [fitToMarkers]="true"
                    />
                  </div>

                  @if (!drawn.polyline) {
                    <p class="mt-3 text-meta text-ink-muted">
                      The stops are shown without a road path: either this route has a single stop,
                      or no map provider is configured for this environment.
                    </p>
                  }
                }
              } @else if (previewError()) {
                <p class="text-body text-ink-muted">We could not load the route map.</p>
              } @else {
                <div class="vx-skeleton h-[26rem] w-full rounded-2xl"></div>
              }
            </vx-section-card>
          }
          @case ('stops') {
            <vexto-route-stops-tab [routeId]="routeId()" (changed)="load()" />
          }
          @case ('passengers') {
            <vexto-route-passengers-tab [routeId]="routeId()" (changed)="load()" />
          }
          @case ('resources') {
            <vexto-route-resources-tab [routeId]="routeId()" (changed)="load()" />
          }
          @case ('schedule') {
            <vexto-route-schedule-tab [routeId]="routeId()" (changed)="load()" />
          }
          @case ('trips') {
            <vx-section-card
              title="Recent trips"
              description="Trips generated from this route."
              [padded]="false"
            >
              @if (trips().length === 0) {
                <vx-empty-state
                  icon="trips"
                  title="No trips yet"
                  description="Add a schedule, then generate trips for a date range."
                />
              } @else {
                <div class="vx-table-scroll vx-scroll">
                  <table class="vx-table">
                    <thead>
                      <tr>
                        <th scope="col">Service date</th>
                        <th scope="col">Scheduled</th>
                        <th scope="col">Driver</th>
                        <th scope="col">Vehicle</th>
                        <th scope="col">Passengers</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (trip of trips(); track trip.id) {
                        <tr class="cursor-pointer" (click)="openTrip(trip)">
                          <td class="vx-cell-strong">{{ date(trip.serviceDate) }}</td>
                          <td>{{ dateTime(trip.scheduledStartAtUtc) }}</td>
                          <td>{{ trip.driver?.name ?? 'Unassigned' }}</td>
                          <td>{{ trip.vehicle?.plateNumber ?? 'Unassigned' }}</td>
                          <td>{{ trip.passengerCount }}</td>
                          <td><vx-status-badge [status]="trip.status" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </vx-section-card>
          }
        }
      </div>

      <vexto-route-form
        [open]="editOpen()"
        [route]="detail()?.route ?? null"
        (dismissed)="editOpen.set(false)"
        (saved)="onEdited()"
      />
    }
  `,
})
export class RouteDetailPage {
  private readonly api = inject(RoutesApi);
  private readonly tripsApi = inject(TripsApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Bound from the `:routeId` segment by `withComponentInputBinding`. */
  readonly routeId = input.required<string>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly viewTrips = VextoPermissions.Trips.View;
  protected readonly date = formatDate;
  protected readonly dateTime = formatDateTime;

  protected readonly detail = signal<RouteDetailResponse | null>(null);
  protected readonly preview = signal<RouteMapPreview | null>(null);
  protected readonly previewError = signal(false);
  protected readonly trips = signal<TripResponse[]>([]);

  /**
   * The stops as map pins, numbered by the operator's own sequence.
   *
   * The first and last are tinted differently so the direction of travel is readable without
   * reading the numbers — which is the question somebody opens this tab to answer.
   */
  protected readonly stopMarkers = computed<VxMapMarker[]>(() => {
    const stops = this.preview()?.stops ?? [];

    return stops.map((stop, index) => ({
      id: stop.id,
      lat: stop.latitude,
      lng: stop.longitude,
      label: `${stop.sequence}. ${stop.name}`,
      tone: index === 0 ? 'success' : index === stops.length - 1 ? 'danger' : 'primary',
    }));
  });

  protected readonly distance = computed(() => {
    const metres = this.preview()?.distanceMeters;

    return metres === null || metres === undefined ? '—' : `${(metres / 1000).toFixed(1)} km`;
  });

  protected readonly duration = computed(() => {
    const seconds = this.preview()?.durationSeconds;

    if (seconds === null || seconds === undefined) {
      return '—';
    }

    const minutes = Math.round(seconds / 60);

    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  });
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tab = signal<TabId>('overview');
  protected readonly editOpen = signal(false);
  protected readonly changingStatus = signal(false);

  protected readonly tabs = computed<VxTab[]>(() => {
    const summary = this.detail()?.summary;

    return [
      { id: 'overview', label: 'Overview' },
      { id: 'map', label: 'Map' },
      { id: 'stops', label: 'Stops', count: summary?.activeStopCount ?? null },
      { id: 'passengers', label: 'Passengers', count: summary?.activePassengerCount ?? null },
      { id: 'resources', label: 'Resources' },
      { id: 'schedule', label: 'Schedule', count: summary?.activeScheduleCount ?? null },
      { id: 'trips', label: 'Trips', count: this.trips().length || null },
    ];
  });

  /** More passengers than seats is the mistake worth catching before the bus arrives. */
  protected readonly overCapacity = computed(() => {
    const summary = this.detail()?.summary;
    const capacity = summary?.currentVehicleCapacity;

    return capacity !== null && capacity !== undefined && summary
      ? summary.activePassengerCount > capacity
      : false;
  });

  constructor() {
    effect(() => {
      this.routeId();
      this.load();
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.get(this.routeId()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load this route.',
        );
      },
    });

    // Recent trips are small and cheap; loading them here keeps the tab instant.
    this.tripsApi.list({ routeId: this.routeId(), pageSize: 10 }).subscribe({
      next: (result) => this.trips.set(result.items),
      error: () => this.trips.set([]),
    });

    // The preview is loaded with the rest rather than on tab open: the backend caches it, so a
    // repeat visit costs nothing, and the tab is instant the first time somebody clicks it. A
    // failure here is contained to the map tab — it must not take the route page down.
    this.previewError.set(false);

    this.api.mapPreview(this.routeId()).subscribe({
      next: (preview) => this.preview.set(preview),
      error: () => {
        this.preview.set(null);
        this.previewError.set(true);
      },
    });
  }

  /**
   * Puts the route into service.
   *
   * Refused by the API for a route with no active stop, which is the mistake worth catching: a
   * route with nowhere to collect anybody would generate trips carrying an empty manifest.
   */
  protected activate(): void {
    this.changeStatus(this.api.activate(this.routeId()), 'This route is now in service.');
  }

  protected deactivate(): void {
    this.changeStatus(this.api.deactivate(this.routeId()), 'This route is out of service.');
  }

  private changeStatus(request: Observable<unknown>, message: string): void {
    if (this.changingStatus()) {
      return;
    }

    this.changingStatus.set(true);

    request.subscribe({
      next: () => {
        this.changingStatus.set(false);
        this.toast.success(message);
        this.load();
      },
      error: (error: unknown) => {
        this.changingStatus.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not change this route.',
        );
      },
    });
  }

  protected select(tab: string): void {
    this.tab.set(tab as TabId);
  }

  protected onEdited(): void {
    this.editOpen.set(false);
    this.toast.success('Route updated.');
    this.load();
  }

  protected openTrip(trip: TripResponse): void {
    void this.router.navigate(['/trips', trip.id]);
  }
}
