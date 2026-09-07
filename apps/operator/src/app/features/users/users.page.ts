import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UsersApi, VextoApiError } from '@vexto/api-client';
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
 * **Invitations, not passwords.** This UI never handles a password for somebody else, and now it
 * does not have to: inviting creates the account and issues a one-shot link, and the person sets
 * their own password. The account is inert until they do — it has no password hash at all, so
 * there is no temporary credential in existence to leak or to forget to change.
 *
 * In Development the API returns the link so it can be copied straight out of the dialog. In
 * production it does not, and the invitee receives it through delivery instead; the dialog says so
 * rather than showing an empty box.
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
    <vx-page-header title="Users" description="Who can sign in to this operator's portal.">
      <button *vxCan="manage" actions type="button" class="vx-btn vx-btn-primary" (click)="openInvite()">
        Invite user
      </button>
    </vx-page-header>

    @if (inviteOpen()) {
      <div class="vx-card mb-5 p-5">
        <h2 class="text-body font-semibold text-ink">Invite a colleague</h2>
        <p class="mt-1 text-meta text-ink-muted">
          They receive a one-time link and choose their own password. You never see it.
        </p>

        <form class="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2" (submit)="invite($event)">
          <label class="block">
            <span class="vx-section-label">First name</span>
            <input
              class="vx-input mt-1 w-full"
              required
              [value]="draft().firstName"
              (input)="patch({ firstName: text($event) })"
            />
          </label>

          <label class="block">
            <span class="vx-section-label">Last name</span>
            <input
              class="vx-input mt-1 w-full"
              required
              [value]="draft().lastName"
              (input)="patch({ lastName: text($event) })"
            />
          </label>

          <label class="block">
            <span class="vx-section-label">Email</span>
            <input
              class="vx-input mt-1 w-full"
              type="email"
              required
              [value]="draft().email"
              (input)="patch({ email: text($event) })"
            />
          </label>

          <label class="block">
            <span class="vx-section-label">Role</span>
            <select
              class="vx-select mt-1 w-full"
              [value]="role()"
              (change)="role.set(value($event))"
            >
              @for (option of roles; track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
          </label>

          <div class="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit"
          (click)="invite($event)" class="vx-btn vx-btn-primary" [disabled]="inviting()">
              {{ inviting() ? 'Sending…' : 'Send invitation' }}
            </button>
            <button
              type="button"
              class="vx-btn vx-btn-ghost"
              [disabled]="inviting()"
              (click)="inviteOpen.set(false)"
            >
              Cancel
            </button>
          </div>
        </form>

        @if (lastInviteUrl(); as url) {
          <div class="mt-4 rounded-xl border border-line-subtle bg-surface-muted p-4">
            <p class="text-meta font-medium text-ink">
              Development only: this link is not returned in production.
            </p>
            <p class="mt-1 break-all text-meta text-ink-secondary">{{ url }}</p>
          </div>
        }
      </div>
    }

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

  /** Tenant-assignable roles only. A tenant can never mint a platform administrator. */
  protected readonly roles = ['TenantAdmin', 'Dispatcher', 'Finance'];

  protected readonly inviteOpen = signal(false);
  protected readonly inviting = signal(false);
  protected readonly role = signal('Dispatcher');
  protected readonly lastInviteUrl = signal<string | null>(null);

  protected readonly draft = signal({ email: '', firstName: '', lastName: '' });

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

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected patch(change: Partial<{ email: string; firstName: string; lastName: string }>): void {
    this.draft.update((current) => ({ ...current, ...change }));
  }

  protected openInvite(): void {
    this.draft.set({ email: '', firstName: '', lastName: '' });
    this.role.set('Dispatcher');
    this.lastInviteUrl.set(null);
    this.inviteOpen.set(true);
  }

  protected invite(event: Event): void {
    event.preventDefault();

    if (this.inviting()) {
      return;
    }

    this.inviting.set(true);

    const { email, firstName, lastName } = this.draft();

    this.api
      .invite({ email, firstName, lastName, phoneNumber: null, roles: [this.role()] })
      .subscribe({
        next: (result) => {
          this.inviting.set(false);

          // Null in production, which is the correct behaviour: the link is a credential.
          this.lastInviteUrl.set(result.invitation.acceptUrl ?? null);

          this.toast.success(`Invitation sent to ${result.user.email}.`);
          this.list.refreshQuietly();
        },
        error: (error: unknown) => {
          this.inviting.set(false);
          this.toast.error(
            error instanceof VextoApiError ? error.message : 'We could not send that invitation.',
          );
        },
      });
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
