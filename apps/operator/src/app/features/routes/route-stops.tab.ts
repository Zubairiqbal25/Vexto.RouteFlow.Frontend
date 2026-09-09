import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import { type VxMapMarker, VxMap } from '@vexto/maps';
import type { RouteStop, RouteStopType } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxField,
  VxFormSection,
  VxIcon,
  VxModal,
  VxSectionCard,
} from '@vexto/ui';
import { humanizeEnum } from '@vexto/utilities';
import { RouteTimeline } from './route-timeline';
import { RouteWorkspaceStore } from './route-workspace.store';

const STOP_TYPES: readonly RouteStopType[] = ['Pickup', 'DropOff', 'PickupAndDropOff'];

/**
 * The stops of a route, as a timeline beside the map they describe.
 *
 * Side by side rather than on two tabs, because they are two views of one answer: the timeline says
 * what the order is and the map says whether that order makes geographic sense. Selecting in either
 * highlights the other — a stop named "Gate 4" means nothing until you can see where Gate 4 is.
 *
 * The pair stacks below `xl`, timeline first: at 1024px the ordering is still the more important
 * of the two, and a half-width map is not a map.
 */
@Component({
  selector: 'vexto-route-stops-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    RouteTimeline,
    VxEmptyState,
    VxField,
    VxFormSection,
    VxIcon,
    VxMap,
    VxModal,
    VxSectionCard,
  ],
  template: `
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <vx-section-card
        title="Stop timeline"
        description="The order passengers are collected and dropped off."
      >
        <button
          *vxCan="manage"
          header-actions
          type="button"
          class="vx-btn vx-btn-secondary vx-btn-sm"
          (click)="add()"
        >
          <vx-icon name="plus" [size]="15" />
          Add stop
        </button>

        @if (stops().length === 0) {
          <vx-empty-state
            icon="map-pin"
            title="No pickup stops yet"
            description="Add stops before activating this route — a route with nowhere to collect anybody would generate trips carrying an empty manifest."
            actionLabel="Add stop"
            (action)="add()"
          />
        } @else {
          <vexto-route-timeline
            [stops]="stops()"
            [pickupCounts]="pickupCounts()"
            [selectedStopId]="selectedStopId()"
            [departureTime]="departureTime()"
            [editable]="canManage()"
            [busy]="reordering()"
            (selected)="store.selectStop($event)"
            (edited)="edit($event)"
            (removed)="remove($event)"
            (moved)="move($event.index, $event.delta)"
          />
        }
      </vx-section-card>

      <vx-section-card title="Route map" description="The stops, and the road between them.">
        @if (preview(); as drawn) {
          <dl class="mb-4 flex flex-wrap gap-x-8 gap-y-3">
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
          </dl>

          @if (drawn.stops.length === 0) {
            <p class="text-body text-ink-muted">
              This route has no active stops yet, so there is nothing to draw.
            </p>
          } @else {
            <div class="h-[26rem] w-full">
              <vx-map
                [markers]="markers()"
                [polyline]="drawn.polyline"
                [fitToMarkers]="true"
                (markerSelected)="store.selectStop($event)"
              />
            </div>

            @if (selectedStop(); as stop) {
              <p class="mt-3 text-meta text-ink-secondary" role="status">
                Showing <span class="font-medium text-ink">{{ stop.name }}</span> —
                {{ pickupCounts().get(stop.id) ?? 0 }} boarding here.
              </p>
            }

            @if (!drawn.polyline) {
              <p class="mt-3 text-meta text-ink-muted">
                The stops are shown without a road path: either this route has a single stop, or no
                map provider is configured for this environment.
              </p>
            }
          }
        } @else if (previewFailed()) {
          <p class="text-body text-ink-muted">
            We could not load the route map. The stop list beside it is unaffected.
          </p>
        } @else {
          <div class="vx-skeleton h-[26rem] w-full rounded-2xl"></div>
        }
      </vx-section-card>
    </div>

    <vx-modal
      [open]="formOpen()"
      [dismissable]="!saving()"
      [title]="editing() ? 'Edit stop' : 'Add stop'"
      description="Coordinates place the stop on the map and are what the vehicle is followed against."
      (closed)="formOpen.set(false)"
    >
      <form [formGroup]="form" (ngSubmit)="save()" id="stop-form">
        @if (formError(); as message) {
          <p
            class="mb-4 rounded-lg px-3.5 py-3 text-body"
            style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <vx-form-section title="Stop">
          <vx-field
            label="Name"
            for="s-name"
            [required]="true"
            [wide]="true"
            [control]="form.controls.name"
          >
            <input id="s-name" class="vx-input" formControlName="name" />
          </vx-field>

          <vx-field label="Latitude" for="s-lat" [required]="true" [control]="form.controls.latitude">
            <input id="s-lat" type="number" step="any" class="vx-input" formControlName="latitude" />
          </vx-field>

          <vx-field
            label="Longitude"
            for="s-lng"
            [required]="true"
            [control]="form.controls.longitude"
          >
            <input
              id="s-lng"
              type="number"
              step="any"
              class="vx-input"
              formControlName="longitude"
            />
          </vx-field>

          <vx-field label="Stop type" for="s-type" [required]="true">
            <select id="s-type" class="vx-select" formControlName="stopType">
              @for (type of stopTypes; track type) {
                <option [value]="type">{{ label(type) }}</option>
              }
            </select>
          </vx-field>

          <vx-field label="Arrival offset" for="s-offset" help="Minutes after the trip starts.">
            <input
              id="s-offset"
              type="number"
              class="vx-input"
              formControlName="estimatedArrivalOffsetMinutes"
            />
          </vx-field>

          <vx-field label="Address" for="s-address" [wide]="true">
            <input id="s-address" class="vx-input" formControlName="address" />
          </vx-field>

          <vx-field
            label="Driver instructions"
            for="s-instructions"
            [wide]="true"
            help="For example: wait at the north gate."
          >
            <textarea
              id="s-instructions"
              rows="2"
              class="vx-textarea"
              formControlName="instructions"
            ></textarea>
          </vx-field>
        </vx-form-section>
      </form>

      <button
        type="button"
        footer
        class="vx-btn vx-btn-secondary"
        [disabled]="saving()"
        (click)="formOpen.set(false)"
      >
        Cancel
      </button>
      <button
        type="submit"
        footer
        form="stop-form"
        (click)="save()"
        class="vx-btn vx-btn-primary"
        [disabled]="saving()"
      >
        {{ saving() ? 'Saving…' : editing() ? 'Save stop' : 'Add stop' }}
      </button>
    </vx-modal>
  `,
})
export class RouteStopsTab {
  private readonly api = inject(RoutesApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly store = inject(RouteWorkspaceStore);

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly stopTypes = STOP_TYPES;
  protected readonly label = humanizeEnum;

  protected readonly stops = this.store.stops;
  protected readonly pickupCounts = this.store.pickupCounts;
  protected readonly selectedStopId = this.store.selectedStopId;
  protected readonly preview = this.store.preview;
  protected readonly previewFailed = this.store.previewFailed;

  protected readonly reordering = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RouteStop | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly permissions = inject(PermissionService);

  /** Asked once for the whole timeline rather than per row. */
  protected readonly canManage = computed(() => this.permissions.has(VextoPermissions.Routes.Manage));

  protected readonly departureTime = computed(
    () => this.store.detail()?.route.defaultStartTime ?? null,
  );

  protected readonly selectedStop = computed(
    () => this.stops().find((stop) => stop.id === this.selectedStopId()) ?? null,
  );

  /**
   * The stops as pins.
   *
   * First and last are tinted differently so the direction of travel is readable without reading
   * the numbers, and the chosen stop is tinted again so the map answers the timeline immediately.
   */
  protected readonly markers = computed<VxMapMarker[]>(() => {
    const stops = this.preview()?.stops ?? [];
    const selected = this.selectedStopId();

    return stops.map((stop, index) => ({
      id: stop.id,
      lat: Number(stop.latitude),
      lng: Number(stop.longitude),
      label: `${stop.sequence}. ${stop.name}`,
      tone:
        stop.id === selected
          ? 'warning'
          : index === 0
            ? 'success'
            : index === stops.length - 1
              ? 'danger'
              : 'primary',
      selected: stop.id === selected,
    }));
  });

  protected readonly distance = computed(() => {
    const metres = this.preview()?.distanceMeters;

    return metres === null || metres === undefined ? '—' : `${(Number(metres) / 1000).toFixed(1)} km`;
  });

  protected readonly duration = computed(() => {
    const seconds = this.preview()?.durationSeconds;

    if (seconds === null || seconds === undefined) {
      return '—';
    }

    const minutes = Math.round(Number(seconds) / 60);

    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    latitude: [0, [Validators.required]],
    longitude: [0, [Validators.required]],
    address: [''],
    instructions: [''],
    stopType: ['Pickup', [Validators.required]],
    estimatedArrivalOffsetMinutes: [null as number | null],
  });

  protected add(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({
      name: '',
      latitude: 0,
      longitude: 0,
      address: '',
      instructions: '',
      stopType: 'Pickup',
      estimatedArrivalOffsetMinutes: null,
    });
    this.formOpen.set(true);
  }

  protected edit(stop: RouteStop): void {
    this.editing.set(stop);
    this.formError.set(null);
    this.form.reset({
      name: stop.name,
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
      address: stop.address ?? '',
      instructions: stop.instructions ?? '',
      stopType: stop.stopType,
      estimatedArrivalOffsetMinutes:
        stop.estimatedArrivalOffsetMinutes === null
          ? null
          : Number(stop.estimatedArrivalOffsetMinutes),
    });
    this.formOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();

      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const value = this.form.getRawValue();
    const existing = this.editing();
    const routeId = this.routeId();

    const body = {
      name: value.name,
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
      address: value.address || null,
      instructions: value.instructions || null,
      stopType: value.stopType as RouteStopType,
      estimatedArrivalOffsetMinutes:
        value.estimatedArrivalOffsetMinutes === null
          ? null
          : Number(value.estimatedArrivalOffsetMinutes),
    };

    const request = existing
      ? this.api.updateStop(routeId, existing.id, body)
      : // A new stop goes to the end of the sequence; reordering is a separate, deliberate action.
        this.api.addStop(routeId, { ...body, sequence: this.stops().length + 1 });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Stop updated.' : 'Stop added.');
        this.afterChange();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(
          error instanceof VextoApiError ? error.message : 'We could not save this stop.',
        );
      },
    });
  }

  protected async remove(stop: RouteStop): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove stop?',
      message: `${stop.name} will be removed from this route. Passengers assigned to it will need a new stop.`,
      confirmLabel: 'Remove',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.removeStop(this.routeId(), stop.id).subscribe({
      next: () => {
        this.toast.success('Stop removed.');
        this.afterChange();
      },
      error: () => this.toast.error('We could not remove this stop.'),
    });
  }

  /** Swaps with the neighbour, then sends the whole ordering so the server is never half-updated. */
  protected move(index: number, delta: number): void {
    const current = this.stops();
    const target = index + delta;

    if (target < 0 || target >= current.length || this.reordering()) {
      return;
    }

    const reordered = [...current];
    const moved = reordered[index];
    const displaced = reordered[target];

    if (!moved || !displaced) {
      return;
    }

    reordered[index] = displaced;
    reordered[target] = moved;

    // Optimistic: the rail renumbers immediately, and a failure puts the old order back.
    this.store.stops.set(reordered);
    this.reordering.set(true);

    this.api
      .reorderStops(
        this.routeId(),
        reordered.map((stop, position) => ({ stopId: stop.id, sequence: position + 1 })),
      )
      .subscribe({
        next: (stops) => {
          this.reordering.set(false);
          this.store.setStops(stops);
          // The drawn path follows the sequence, so a reorder makes the cached preview wrong.
          this.store.refreshPreview();
        },
        error: () => {
          this.reordering.set(false);
          this.store.stops.set(current);
          this.toast.error('We could not reorder the stops.');
        },
      });
  }

  private routeId(): string {
    return this.store.detail()?.route.id ?? '';
  }

  /** A stop change moves the map, the counts and the readiness gaps all at once. */
  private afterChange(): void {
    this.store.refreshStops();
    this.store.refreshPreview();
    this.store.refreshDetail();
  }
}

