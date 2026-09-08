import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { PassengerAccessApi, PassengersApi } from '@vexto/api-client';
import type { OperatorPassengerAccess, PassengerResponse } from '@vexto/models';
import { CanDirective, PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxIcon,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxCardGrid,
  VxSkeletonCard,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
  VxViewSwitcher,
} from '@vexto/ui';
import { formatDate, formatMobile } from '@vexto/utilities';
import { listViewPreference } from '../../shared/list-view';
import { PagedList } from '../../shared/paged-list';
import { PassengerCard } from './passenger-card';
import { PassengerDrawer } from './passenger-drawer';
import { PassengerForm } from './passenger-form';

interface PassengerFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

@Component({
  selector: 'vexto-passengers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PassengerForm,
    VxAvatar,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxIcon,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxCardGrid,
    VxSkeletonCard,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
    VxViewSwitcher,
    PassengerCard,
    PassengerDrawer,
  ],
  template: `
    <vx-page-header
      title="Passengers"
      description="Manage passengers and transport access."
    >
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="add()">
        <vx-icon name="plus" [size]="16" />
        Add Passenger
      </button>
    </vx-page-header>

    <vx-table-shell
      [layout]="layout()"
      [loading]="list.loading()"
      [error]="list.error()"
      [isEmpty]="list.isEmpty()"
      [page]="list.page()"
      [pageSize]="list.pageSize"
      [totalCount]="list.total()"
      (pageChange)="list.setPage($event)"
    >
      <vx-filter-bar
        toolbar
        searchPlaceholder="Search name, mobile or email"
        searchLabel="Search passengers"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="onStatus($event)"
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="flex items-center gap-3">
          <span class="hidden text-meta text-ink-muted sm:inline">
            {{ list.total() }} {{ list.total() === 1 ? 'passenger' : 'passengers' }}
          </span>
          <vx-view-switcher [view]="layout()" (viewChange)="setView($event)" />
        </span>
      </vx-filter-bar>

      <div loading>
        @if (layout() === 'cards') {
          <div class="p-4 sm:p-5">
            <vx-card-grid><vx-skeleton-card [count]="6" /></vx-card-grid>
          </div>
        } @else {
          <vx-skeleton-table [columns]="6" />
        }
      </div>

      <vx-error-state
        error
        title="We could not load passengers"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="passengers"
        [title]="list.isFiltered() ? 'No matching passengers' : 'No passengers yet'"
        [description]="
          list.isFiltered()
            ? 'Try a different search term or clear the status filter.'
            : 'Add your first passenger to start building transport routes.'
        "
        [actionLabel]="list.isFiltered() ? null : 'Add Passenger'"
        (action)="add()"
      />

      @if (layout() === 'cards') {
        <vx-card-grid>
          @for (passenger of list.items(); track passenger.id) {
            <vexto-passenger-card
              [passenger]="passenger"
              [access]="accessFor(passenger.id)"
              [selected]="inspected()?.id === passenger.id"
              (opened)="inspect(passenger)"
              (action)="onCardAction(passenger, $event)"
            />
          }
        </vx-card-grid>
      } @else {
      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Mobile</th>
            <th scope="col">Email</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (passenger of list.items(); track passenger.id) {
            <tr>
              <td>
                <div class="flex items-center gap-3">
                  <vx-avatar [name]="passenger.firstName" [secondName]="passenger.lastName" />
                  <span class="vx-cell-strong">
                    {{ passenger.firstName }} {{ passenger.lastName }}
                  </span>
                </div>
              </td>
              <td>{{ mobile(passenger.mobileNumber) }}</td>
              <td>{{ passenger.email || '—' }}</td>
              <td><vx-status-badge [status]="passenger.status" /></td>
              <td>{{ created(passenger.createdAtUtc) }}</td>
              <td class="text-end">
                <vx-row-actions [label]="'Actions for ' + passenger.firstName">
                  <vx-row-action icon="eye" (selected)="view(passenger)">View</vx-row-action>
                  <ng-container *vxCan="manage">
                    <vx-row-action icon="edit" (selected)="edit(passenger)">Edit</vx-row-action>
                    @if (passenger.status === 'Active') {
                      <vx-row-action icon="power" [danger]="true" (selected)="deactivate(passenger)">
                        Deactivate
                      </vx-row-action>
                    } @else {
                      <vx-row-action icon="check" (selected)="activate(passenger)">
                        Activate
                      </vx-row-action>
                    }
                  </ng-container>
                </vx-row-actions>
              </td>
            </tr>
          }
        </tbody>
      </table>
      }
    </vx-table-shell>

    <vexto-passenger-drawer
      [passenger]="inspected()"
      [access]="inspected() ? accessFor(inspected()!.id) : null"
      (closed)="inspected.set(null)"
      (edit)="editFromDrawer($event)"
    />

    <vexto-passenger-form
      [open]="formOpen()"
      [passenger]="editing()"
      (dismissed)="formOpen.set(false)"
      (saved)="onSaved()"
    />
  `,
})
export class PassengersPage {
  private readonly api = inject(PassengersApi);
  private readonly accessApi = inject(PassengerAccessApi);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly manage = VextoPermissions.Passengers.Manage;

  private readonly preference = listViewPreference('passengers');
  protected readonly layout = this.preference.view;

  /**
   * Billing state per passenger, fetched once per page rather than once per card.
   *
   * Only when the signed-in user holds `Billing.View`: a dispatcher can see a passenger and must
   * not see what they owe, and the card renders without the access line rather than with a
   * placeholder describing what they may not know.
   */
  private readonly access = signal<ReadonlyMap<string, OperatorPassengerAccess>>(new Map());

  /** The passenger shown in the quick-view drawer. Null is the normal state. */
  protected readonly inspected = signal<PassengerResponse | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<PassengerResponse | null>(null);

  protected readonly list = new PagedList<PassengerResponse, PassengerFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  protected readonly mobile = formatMobile;
  protected readonly created = formatDate;

  constructor() {
    // One batched request per page of results. Asking per card would be the N+1 the batch endpoint
    // exists to prevent.
    effect(() => {
      const passengers = this.list.items();

      if (passengers.length === 0 || !this.permissions.has(VextoPermissions.Billing.View)) {
        return;
      }

      this.accessApi.forMany(passengers.map((passenger) => passenger.id)).subscribe({
        next: (rows) => this.access.set(new Map(rows.map((row) => [row.passengerId, row]))),

        // A failure here must not break the list. The cards simply show no access line.
        error: () => this.access.set(new Map()),
      });
    });
  }

  protected inspect(passenger: PassengerResponse): void {
    this.inspected.set(passenger);
  }

  /** The drawer is the shortcut; editing is still the record's own form. */
  protected editFromDrawer(passenger: PassengerResponse): void {
    this.inspected.set(null);
    this.edit(passenger);
  }

  protected setView(view: 'cards' | 'table'): void {
    this.preference.set(view);
  }

  protected accessFor(passengerId: string): OperatorPassengerAccess | null {
    return this.access().get(passengerId) ?? null;
  }

  /** Routes an overflow-menu choice to the same handlers the table rows use. */
  protected onCardAction(passenger: PassengerResponse, action: string): void {
    const handlers: Record<string, () => void> = {
      edit: () => this.edit(passenger),
      invite: () => this.invite(passenger),
      activate: () => this.activate(passenger),
      deactivate: () => void this.deactivate(passenger),
    };

    handlers[action]?.();
  }

  /** The invitation panel is opened from the record itself, which is where the email lives. */
  protected invite(passenger: PassengerResponse): void {
    this.edit(passenger);
  }

  protected onStatus(event: Event): void {
    this.list.setFilter({ status: (event.target as HTMLSelectElement).value });
  }

  protected add(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(passenger: PassengerResponse): void {
    this.editing.set(passenger);
    this.formOpen.set(true);
  }

  /** No passenger detail page in this milestone; editing is where the full record is read. */
  protected view(passenger: PassengerResponse): void {
    this.edit(passenger);
  }

  protected onSaved(): void {
    this.formOpen.set(false);
    this.list.refreshQuietly();
  }

  protected activate(passenger: PassengerResponse): void {
    this.api.activate(passenger.id).subscribe({
      next: () => {
        this.toast.success(`${passenger.firstName} can travel again.`);
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not activate this passenger.'),
    });
  }

  protected async deactivate(passenger: PassengerResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Deactivate passenger?',
      message: `${passenger.firstName} ${passenger.lastName} will stop being included on future trips. Their history is kept.`,
      confirmLabel: 'Deactivate',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.deactivate(passenger.id).subscribe({
      next: () => {
        this.toast.success('Passenger deactivated.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not deactivate this passenger.'),
    });
  }
}
