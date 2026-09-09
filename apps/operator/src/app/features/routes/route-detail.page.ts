import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ToastService,
  type VxCardAction,
  type VxTab,
  VxErrorState,
  VxIcon,
  VxPageHeader,
  VxQuickActions,
  VxSkeleton,
  VxStatusBadge,
  VxTabs,
} from '@vexto/ui';
import { formatDayTime } from '@vexto/utilities';
import { GenerateTripsDrawer } from './generate-trips.drawer';
import { RouteForm } from './route-form';
import { RouteOverviewTab } from './route-overview.tab';
import { RoutePassengersTab } from './route-passengers.tab';
import { RouteResourcesTab } from './route-resources.tab';
import { RouteScheduleTab } from './route-schedule.tab';
import { RouteStopsTab } from './route-stops.tab';
import { RouteTripsTab } from './route-trips.tab';
import { RouteWorkspaceStore } from './route-workspace.store';

type TabId = 'overview' | 'stops' | 'passengers' | 'crew' | 'schedule' | 'trips';

/**
 * The route operations workspace.
 *
 * The header answers, before anything is clicked: what is this route, is it running, **is it ready
 * to produce trips**, and how big is it. Readiness is the addition that matters — a route can be
 * fully configured in every visible respect and still be unable to generate a single journey, and
 * the old header had no way to say so. Now the answer is a line of text at the top, and each gap
 * names the thing to go and do.
 *
 * Data is loaded once by `RouteWorkspaceStore` and read by every tab, so switching tabs costs
 * nothing and no collection is fetched twice.
 */
@Component({
  selector: 'vexto-route-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RouteWorkspaceStore],
  imports: [
    CanDirective,
    GenerateTripsDrawer,
    RouteForm,
    RouteOverviewTab,
    RoutePassengersTab,
    RouteResourcesTab,
    RouteScheduleTab,
    RouteStopsTab,
    RouteTripsTab,
    VxErrorState,
    VxIcon,
    VxPageHeader,
    VxQuickActions,
    VxSkeleton,
    VxStatusBadge,
    VxTabs,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not load this route" [message]="message" (retry)="reload()" />
    } @else {
      <vx-page-header
        [title]="detail()?.route?.name ?? 'Route'"
        [description]="detail()?.route?.code ?? null"
        [breadcrumbs]="breadcrumbs()"
      >
        <ng-container actions>
          @if (detail()) {
            <button
              *vxCan="manageTrips"
              type="button"
              class="vx-btn vx-btn-primary"
              (click)="generateOpen.set(true)"
            >
              <vx-icon name="trips" [size]="16" />
              Generate trips
            </button>

            <button
              *vxCan="manage"
              type="button"
              class="vx-btn vx-btn-secondary"
              (click)="editOpen.set(true)"
            >
              <vx-icon name="edit" [size]="16" />
              Edit route
            </button>

            <vx-quick-actions
              *vxCan="manage"
              [actions]="moreActions()"
              label="More route actions"
              (selected)="onMoreAction($event)"
            />
          }
        </ng-container>
      </vx-page-header>

      <!-- Status strip ------------------------------------------------------------------------ -->
      <section class="vx-card vx-card-pad mb-6">
        @if (loading()) {
          <div class="flex flex-col gap-3">
            <vx-skeleton width="14rem" height="1.5rem" />
            <vx-skeleton width="22rem" height="1rem" />
            <div class="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              @for (tile of [0, 1, 2, 3]; track tile) {
                <vx-skeleton height="3rem" />
              }
            </div>
          </div>
        } @else if (detail(); as loaded) {
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="vx-section-label">Status</p>
                <vx-status-badge [status]="loaded.route.status" />
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <p class="vx-section-label">Readiness</p>
                @if (ready()) {
                  <vx-status-badge
                    tone="success"
                    icon="check-circle"
                    label="Ready for trip generation"
                  />
                } @else {
                  @for (gap of gaps(); track gap.id) {
                    <vx-status-badge
                      [tone]="gap.level === 'critical' ? 'danger' : 'warning'"
                      icon="alert"
                      [label]="gap.label"
                    />
                  }
                }
              </div>

              <p class="mt-3 text-meta text-ink-muted">
                {{ loaded.route.direction }}
                @if (loaded.route.defaultStartTime) {
                  · Departs {{ loaded.route.defaultStartTime.slice(0, 5) }}
                }
              </p>
            </div>

            <dl class="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <div>
                <dt class="vx-section-label">Stops</dt>
                <dd class="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {{ loaded.summary.activeStopCount }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Passengers</dt>
                <dd class="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {{ loaded.summary.activePassengerCount }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Schedules</dt>
                <dd class="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {{ loaded.summary.activeScheduleCount }}
                </dd>
              </div>
              <div>
                <dt class="vx-section-label">Next trip</dt>
                <dd class="mt-1 text-body font-medium text-ink">{{ nextTripLabel() }}</dd>
              </div>
            </dl>
          </div>
        }
      </section>

      <vx-tabs [tabs]="tabs()" [active]="tab()" label="Route sections" (selected)="select($event)" />

      <div class="mt-6">
        @switch (tab()) {
          @case ('overview') {
            <vexto-route-overview-tab (openTab)="select($event)" />
          }
          @case ('stops') {
            <vexto-route-stops-tab />
          }
          @case ('passengers') {
            <vexto-route-passengers-tab />
          }
          @case ('crew') {
            <vexto-route-resources-tab />
          }
          @case ('schedule') {
            <vexto-route-schedule-tab />
          }
          @case ('trips') {
            <vexto-route-trips-tab />
          }
        }
      </div>

      <vexto-route-form
        [open]="editOpen()"
        [route]="detail()?.route ?? null"
        (dismissed)="editOpen.set(false)"
        (saved)="onEdited()"
      />

      <vexto-generate-trips-drawer
        [open]="generateOpen()"
        (dismissed)="generateOpen.set(false)"
        (generated)="onGenerated()"
      />
    }
  `,
})
export class RouteDetailPage {
  private readonly api = inject(RoutesApi);
  private readonly toast = inject(ToastService);
  private readonly store = inject(RouteWorkspaceStore);

  /** Bound from the `:routeId` segment by `withComponentInputBinding`. */
  readonly routeId = input.required<string>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly manageTrips = VextoPermissions.Trips.Manage;

  protected readonly detail = this.store.detail;
  protected readonly loading = this.store.loading;
  protected readonly error = this.store.error;
  protected readonly gaps = this.store.gaps;
  protected readonly ready = this.store.ready;

  protected readonly tab = signal<TabId>('overview');
  protected readonly editOpen = signal(false);
  protected readonly generateOpen = signal(false);
  protected readonly changingStatus = signal(false);

  protected readonly breadcrumbs = computed(() => [
    { label: 'Routes', link: '/routes' },
    { label: this.detail()?.route.name ?? 'Route' },
  ]);

  protected readonly nextTripLabel = computed(() => {
    const trip = this.store.nextTrip();

    return trip ? formatDayTime(trip.scheduledStartAtUtc) : 'None scheduled';
  });

  protected readonly tabs = computed<VxTab[]>(() => {
    const summary = this.detail()?.summary;

    return [
      { id: 'overview', label: 'Overview' },
      { id: 'stops', label: 'Stops & map', count: numberOrNull(summary?.activeStopCount) },
      { id: 'passengers', label: 'Passengers', count: numberOrNull(summary?.activePassengerCount) },
      { id: 'crew', label: 'Driver & vehicle' },
      { id: 'schedule', label: 'Schedule', count: numberOrNull(summary?.activeScheduleCount) },
      { id: 'trips', label: 'Trips', count: this.store.upcomingTrips().length || null },
    ];
  });

  /**
   * The actions a route has that are neither of the two primary ones.
   *
   * Activate and deactivate swap rather than both appearing greyed: an operator scanning this menu
   * needs the next action, not an inventory of the ones that do not apply.
   */
  protected readonly moreActions = computed<readonly VxCardAction[]>(() => {
    const active = this.detail()?.route.status === 'Active';

    return [
      active
        ? { id: 'deactivate', label: 'Take out of service', icon: 'power' as const, danger: true }
        : { id: 'activate', label: 'Activate route', icon: 'check' as const },
      { id: 'view-trips', label: 'View all trips', icon: 'trips' as const },
    ];
  });

  constructor() {
    effect(() => {
      const routeId = this.routeId();

      this.store.load(routeId);
    });
  }

  protected reload(): void {
    this.store.load(this.routeId());
  }

  protected select(tab: string): void {
    this.tab.set(tab as TabId);
  }

  protected onMoreAction(action: string): void {
    if (action === 'activate') {
      this.changeStatus(this.api.activate(this.routeId()), 'This route is now in service.');
    } else if (action === 'deactivate') {
      this.changeStatus(this.api.deactivate(this.routeId()), 'This route is out of service.');
    } else if (action === 'view-trips') {
      this.tab.set('trips');
    }
  }

  /**
   * Puts the route into or out of service.
   *
   * Refused by the API for a route with no active stop, which is the mistake worth catching: a
   * route with nowhere to collect anybody would generate trips carrying an empty manifest. The
   * refusal's own wording is shown rather than a generic failure.
   */
  private changeStatus(request: Observable<unknown>, message: string): void {
    if (this.changingStatus()) {
      return;
    }

    this.changingStatus.set(true);

    request.subscribe({
      next: () => {
        this.changingStatus.set(false);
        this.toast.success(message);
        this.store.refreshDetail();
      },
      error: (error: unknown) => {
        this.changingStatus.set(false);
        this.toast.error(
          error instanceof VextoApiError ? error.message : 'We could not change this route.',
        );
      },
    });
  }

  protected onEdited(): void {
    this.editOpen.set(false);
    this.toast.success('Route updated.');
    this.store.refreshDetail();
  }

  protected onGenerated(): void {
    this.store.refreshTrips();
    this.store.refreshDetail();
  }
}

/** A tab count that hides itself at zero rather than showing a `0` badge on every route. */
function numberOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value) || null;
}
