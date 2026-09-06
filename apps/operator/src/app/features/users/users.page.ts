import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UsersApi } from '@vexto/api-client';
import type { UserResponse } from '@vexto/models';
import { CanDirective, VextoPermissions } from '@vexto/permissions';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxFilterBar,
  VxPageHeader,
  VxRowAction,
  VxRowActions,
  VxSkeletonTable,
  VxStatusBadge,
  VxTableShell,
} from '@vexto/ui';
import { formatDateTime } from '@vexto/utilities';
import { PagedList } from '../../shared/paged-list';

interface UserFilters extends Record<string, unknown> {
  search: string;
  status: string;
}

/**
 * Portal accounts for this operator.
 *
 * Creating a user needs a password, and Vexto's rule is that this UI never handles one: accounts
 * are created through the platform and driver/passenger account flows. This screen therefore
 * manages the accounts that exist — activation, suspension and roles — and does not offer a
 * "new user" form.
 */
@Component({
  selector: 'vexto-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    VxAvatar,
    VxEmptyState,
    VxErrorState,
    VxFilterBar,
    VxPageHeader,
    VxRowAction,
    VxRowActions,
    VxSkeletonTable,
    VxStatusBadge,
    VxTableShell,
  ],
  template: `
    <vx-page-header title="Users" description="Who can sign in to this operator's portal." />

    <vx-table-shell
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
        searchPlaceholder="Search name or email"
        searchLabel="Search users"
        (searchChange)="list.setFilter({ search: $event })"
      >
        <select
          filters
          class="vx-select w-auto"
          aria-label="Filter by status"
          (change)="list.setFilter({ status: value($event) })"
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="PendingInvitation">Invited</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <span trailing class="text-meta text-ink-muted">
          {{ list.total() }} {{ list.total() === 1 ? 'user' : 'users' }}
        </span>
      </vx-filter-bar>

      <vx-skeleton-table loading [columns]="5" />

      <vx-error-state
        error
        title="We could not load users"
        [message]="list.error() ?? ''"
        (retry)="list.reload()"
      />

      <vx-empty-state
        empty
        icon="users"
        title="No users match this view"
        description="Clear the filters, or ask a platform administrator to create an account."
      />

      <table class="vx-table">
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Roles</th>
            <th scope="col">Status</th>
            <th scope="col">Last sign-in</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (user of list.items(); track user.id) {
            <tr>
              <td>
                <div class="flex items-center gap-3">
                  <vx-avatar [name]="user.firstName" [secondName]="user.lastName" />
                  <div class="min-w-0">
                    <span class="vx-cell-strong block truncate">
                      {{ user.firstName }} {{ user.lastName }}
                    </span>
                    <span class="block truncate text-meta text-ink-muted">{{ user.email }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex flex-wrap gap-1.5">
                  @for (role of user.roles; track role) {
                    <vx-status-badge tone="neutral" [label]="role" />
                  }
                </div>
              </td>
              <td><vx-status-badge [status]="user.status" /></td>
              <td>{{ user.lastLoginAtUtc ? dateTime(user.lastLoginAtUtc) : 'Never' }}</td>
              <td class="text-end">
                <vx-row-actions *vxCan="manage" [label]="'Actions for ' + user.firstName">
                  @if (user.status === 'Active') {
                    <vx-row-action icon="power" [danger]="true" (selected)="suspend(user)">
                      Suspend
                    </vx-row-action>
                  } @else {
                    <vx-row-action icon="check" (selected)="activate(user)">Activate</vx-row-action>
                  }
                </vx-row-actions>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </vx-table-shell>
  `,
})
export class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly manage = VextoPermissions.Users.Manage;
  protected readonly dateTime = formatDateTime;

  protected readonly list = new PagedList<UserResponse, UserFilters>(
    (filters, page, pageSize) =>
      this.api.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        pageNumber: page,
        pageSize,
      }),
    { search: '', status: '' },
  );

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected activate(user: UserResponse): void {
    this.api.activate(user.id).subscribe({
      next: () => {
        this.toast.success('User activated.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not activate this user.'),
    });
  }

  protected async suspend(user: UserResponse): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Suspend this account?',
      message: `${user.email} will be signed out and unable to sign back in until reactivated.`,
      confirmLabel: 'Suspend',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.suspend(user.id).subscribe({
      next: () => {
        this.toast.success('User suspended.');
        this.list.refreshQuietly();
      },
      error: () => this.toast.error('We could not suspend this user.'),
    });
  }
}
