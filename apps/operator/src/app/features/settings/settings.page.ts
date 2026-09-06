import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService, AuthStore } from '@vexto/auth';
import { PermissionService } from '@vexto/permissions';
import { ToastService, VxPageHeader, VxSectionCard, VxStatusBadge } from '@vexto/ui';

/**
 * The signed-in user's own account, and what they are allowed to do.
 *
 * Tenant settings (time zone, currency, date format) are returned by the tenant detail endpoint,
 * which is platform-scoped — an operator user cannot read their own tenant's settings today. That
 * gap is recorded in docs/frontend-architecture.md rather than papered over with a form that
 * cannot save.
 */
@Component({
  selector: 'vexto-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxPageHeader, VxSectionCard, VxStatusBadge],
  template: `
    <vx-page-header title="Settings" description="Your account and access." />

    <div class="grid gap-5 lg:grid-cols-2">
      <vx-section-card title="Your account">
        <dl class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <dt class="vx-section-label">Name</dt>
            <dd class="mt-1 text-body text-ink">{{ fullName() }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Email</dt>
            <dd class="mt-1 truncate text-body text-ink">{{ user()?.email }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Operator</dt>
            <dd class="mt-1 text-body text-ink">{{ user()?.tenantName ?? 'Platform' }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Roles</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              @for (role of user()?.roles ?? []; track role) {
                <vx-status-badge tone="neutral" [label]="role" />
              }
            </dd>
          </div>
        </dl>

        <div class="mt-6 flex flex-wrap gap-2 border-t border-line-subtle pt-5">
          <button type="button" class="vx-btn vx-btn-secondary" (click)="refresh()">
            Refresh permissions
          </button>
          <button type="button" class="vx-btn vx-btn-ghost" (click)="signOut()">Sign out</button>
        </div>
      </vx-section-card>

      <vx-section-card
        title="Permissions"
        description="What this account can do. Granted by your roles."
      >
        @if (permissions().length === 0) {
          <p class="text-body text-ink-muted">No permissions granted.</p>
        } @else {
          <div class="flex flex-wrap gap-1.5">
            @for (permission of permissions(); track permission) {
              <vx-status-badge tone="primary" [label]="permission" />
            }
          </div>
        }
      </vx-section-card>
    </div>
  `,
})
export class SettingsPage {
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly permissionService = inject(PermissionService);

  protected readonly user = this.store.user;

  protected readonly fullName = computed(() => {
    const user = this.user();

    return user ? `${user.firstName} ${user.lastName}` : '—';
  });

  protected readonly permissions = computed(() =>
    [...this.permissionService.granted()].sort((a, b) => a.localeCompare(b)),
  );

  /** Picks up a role change without making the user sign out and back in. */
  protected refresh(): void {
    this.auth.refreshProfile().subscribe({
      next: () => this.toast.success('Permissions refreshed.'),
      error: () => this.toast.error('We could not refresh your permissions.'),
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
