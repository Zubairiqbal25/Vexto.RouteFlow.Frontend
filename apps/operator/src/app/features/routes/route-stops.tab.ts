import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoutesApi, VextoApiError } from '@vexto/api-client';
import type { RouteStop, RouteStopType } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxEmptyState,
  VxErrorState,
  VxField,
  VxFormSection,
  VxIcon,
  VxModal,
  VxSectionCard,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { humanizeEnum } from '@vexto/utilities';

const STOP_TYPES: readonly RouteStopType[] = ['Pickup', 'DropOff', 'PickupAndDropOff'];

/**
 * The stops on a route, as an ordered timeline.
 *
 * A route is a *sequence*, and a plain table hides that. The numbered rail is the shape of the
 * journey, which is what a planner is actually checking when they open this tab.
 *
 * Reordering is done with move up/down rather than drag: it works with a keyboard and on a touch
 * screen, and it maps exactly onto the reorder endpoint, which takes the whole new ordering in one
 * request so a sequence is never left half-applied.
 */
@Component({
  selector: 'vexto-route-stops-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    ReactiveFormsModule,
    VxEmptyState,
    VxErrorState,
    VxField,
    VxFormSection,
    VxIcon,
    VxModal,
    VxSectionCard,
    VxSkeleton,
    VxStatusBadge,
  ],
  template: `
    <vx-section-card
      title="Stops"
      description="The order passengers are collected and dropped off."
      [padded]="false"
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

      @if (loading()) {
        <div class="flex flex-col gap-4 p-6">
          @for (row of [0, 1, 2]; track row) {
            <div class="flex items-center gap-4">
              <vx-skeleton width="2.25rem" height="2.25rem" />
              <vx-skeleton width="40%" height="1rem" />
            </div>
          }
        </div>
      } @else if (error()) {
        <vx-error-state title="We could not load stops" [message]="error()!" (retry)="load()" />
      } @else if (stops().length === 0) {
        <vx-empty-state
          icon="map-pin"
          title="No stops yet"
          description="Add the pickup and drop-off points, in the order the vehicle visits them."
          actionLabel="Add stop"
          (action)="add()"
        />
      } @else {
        <ol class="p-6">
          @for (stop of stops(); track stop.id; let index = $index, last = $last) {
            <li class="relative flex gap-4 pb-6 last:pb-0">
              @if (!last) {
                <span
                  class="absolute left-[1.125rem] top-9 bottom-0 w-px"
                  style="background: var(--vexto-border)"
                  aria-hidden="true"
                ></span>
              }

              <span
                class="relative z-10 flex size-9 flex-none items-center justify-center rounded-full border text-meta font-semibold"
                style="background: var(--vexto-surface); border-color: var(--vexto-primary-200); color: var(--vexto-primary-active)"
              >
                {{ sequenceLabel(index) }}
              </span>

              <div class="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium text-ink">{{ stop.name }}</p>
                  <p class="mt-0.5 text-meta text-ink-muted">
                    {{ stop.address || 'No address recorded' }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <vx-status-badge tone="neutral" [label]="label(stop.stopType)" />
                    @if (stop.estimatedArrivalOffsetMinutes !== null) {
                      <vx-status-badge
                        tone="info"
                        icon="clock"
                        [label]="'+' + stop.estimatedArrivalOffsetMinutes + ' min'"
                      />
                    }
                  </div>
                  @if (stop.instructions) {
                    <p class="mt-2 max-w-prose text-meta text-ink-secondary">
                      {{ stop.instructions }}
                    </p>
                  }
                </div>

                <div *vxCan="manage" class="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Move ' + stop.name + ' earlier'"
                    [disabled]="index === 0 || reordering()"
                    (click)="move(index, -1)"
                  >
                    <vx-icon name="chevron-left" [size]="16" class="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Move ' + stop.name + ' later'"
                    [disabled]="last || reordering()"
                    (click)="move(index, 1)"
                  >
                    <vx-icon name="chevron-right" [size]="16" class="rotate-90" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Edit ' + stop.name"
                    (click)="edit(stop)"
                  >
                    <vx-icon name="edit" [size]="16" />
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
                    [attr.aria-label]="'Remove ' + stop.name"
                    (click)="remove(stop)"
                  >
                    <vx-icon name="trash" [size]="16" />
                  </button>
                </div>
              </div>
            </li>
          }
        </ol>
      }
    </vx-section-card>

    <vx-modal
      [open]="formOpen()"
      [dismissable]="!saving()"
      [title]="editing() ? 'Edit stop' : 'Add stop'"
      description="Coordinates are used to place the stop on the map and to follow the vehicle."
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

          <vx-field
            label="Arrival offset"
            for="s-offset"
            help="Minutes after the trip starts."
          >
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

  readonly routeId = input.required<string>();
  /** Lets the detail header refresh its stop count without re-fetching the whole route. */
  readonly changed = output<void>();

  protected readonly manage = VextoPermissions.Routes.Manage;
  protected readonly stopTypes = STOP_TYPES;
  protected readonly label = humanizeEnum;

  protected readonly stops = signal<RouteStop[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly reordering = signal(false);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RouteStop | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    latitude: [0, [Validators.required]],
    longitude: [0, [Validators.required]],
    address: [''],
    instructions: [''],
    stopType: ['Pickup', [Validators.required]],
    estimatedArrivalOffsetMinutes: [null as number | null],
  });

  /** Position comes from array order, so numbering stays correct during an optimistic reorder. */
  protected sequenceLabel(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  constructor() {
    effect(() => {
      // Re-reads whenever the route changes, which is what makes this reusable across navigations.
      this.routeId();
      this.load();
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.stops(this.routeId()).subscribe({
      next: (stops) => {
        this.stops.set([...stops].sort((a, b) => a.sequence - b.sequence));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not load the stops.',
        );
      },
    });
  }

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
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address ?? '',
      instructions: stop.instructions ?? '',
      stopType: stop.stopType,
      estimatedArrivalOffsetMinutes: stop.estimatedArrivalOffsetMinutes,
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
      ? this.api.updateStop(this.routeId(), existing.id, body)
      : // A new stop goes to the end of the sequence; reordering is a separate, deliberate action.
        this.api.addStop(this.routeId(), { ...body, sequence: this.stops().length + 1 });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Stop updated.' : 'Stop added.');
        this.load();
        this.changed.emit();
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
        this.load();
        this.changed.emit();
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
    this.stops.set(reordered);
    this.reordering.set(true);

    this.api
      .reorderStops(
        this.routeId(),
        reordered.map((stop, position) => ({ stopId: stop.id, sequence: position + 1 })),
      )
      .subscribe({
        next: (stops) => {
          this.reordering.set(false);
          this.stops.set([...stops].sort((a, b) => a.sequence - b.sequence));
        },
        error: () => {
          this.reordering.set(false);
          this.stops.set(current);
          this.toast.error('We could not reorder the stops.');
        },
      });
  }
}
