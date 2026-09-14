import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { PlatformApi, VextoApiError } from '@vexto/api-client';
import type { TenantAdministrator } from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxAvatar,
  VxEmptyState,
  VxIcon,
  VxModal,
  VxRowAction,
  VxRowActions,
  VxSectionCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

interface InviteDraft {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'TenantOwner' | 'TenantAdmin';
}

/**
 * An operator's administrators, managed from the CMS.
 *
 * Owners and administrators only — the two roles a platform administrator may hand out. Drivers,
 * dispatchers and passengers are the operator's own to manage from their portal, and this section
 * neither lists nor creates them. Invitations reuse the central invitation system: a link that
 * activates the account, then sign-in by emailed code. There is no password field here or anywhere.
 *
 * The tenant is the one in the route; the invite body never names one. The server decides which
 * tenant an invitation belongs to from the URL it was posted to.
 */
@Component({
  selector: 'vexto-cms-tenant-administrators',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxEmptyState, VxIcon, VxModal, VxRowAction, VxRowActions, VxSectionCard, VxStatusBadge],
  template: `
    <vx-section-card title="Administrators" description="Who can administer this operator. Invitations activate an account; sign-in is by email code." [padded]="false">
      <button header-actions type="button" class="vx-btn vx-btn-primary vx-btn-sm" data-testid="invite-administrator" (click)="openInvite()">
        <vx-icon name="send" [size]="15" />
        Invite Administrator
      </button>

      @if (administrators().length === 0) {
        <vx-empty-state icon="users" title="No administrators yet" description="Invite a tenant owner so somebody can sign in and finish setting this operator up." />
      } @else {
        <ul class="divide-y divide-line-subtle" data-testid="administrator-list">
          @for (admin of administrators(); track admin.userId) {
            <li class="flex items-center gap-4 px-5 py-3.5">
              <vx-avatar size="md" [name]="admin.firstName" [secondName]="admin.lastName" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-body font-medium text-ink">{{ admin.firstName }} {{ admin.lastName }}</span>
                <span class="block truncate text-meta text-ink-muted">{{ admin.email }}</span>
              </span>
              <span class="hidden w-28 text-meta text-ink-secondary sm:block">{{ roleLabel(admin) }}</span>
              <span class="hidden flex-col items-start gap-1 md:flex">
                <vx-status-badge [status]="admin.accountStatus" />
                @if (admin.invitationStatus === 'Pending') {
                  <span class="text-meta text-ink-muted">Invitation pending</span>
                } @else if (admin.invitationStatus === 'Expired') {
                  <span class="text-meta" style="color: var(--vexto-warning-text)">Invitation expired</span>
                }
              </span>
              <span class="hidden w-28 text-end text-meta text-ink-muted lg:inline">
                {{ admin.lastLoginAtUtc ? relative(admin.lastLoginAtUtc) : 'Never signed in' }}
              </span>
              <vx-row-actions>
                @if (admin.accountStatus !== 'Active' || admin.invitationStatus === 'Pending') {
                  <vx-row-action icon="send" (selected)="resend(admin)">Resend invitation</vx-row-action>
                }
                @if (admin.invitationStatus === 'Pending') {
                  <vx-row-action icon="ban" (selected)="revoke(admin)">Revoke invitation</vx-row-action>
                }
                @if (admin.accountStatus === 'Active') {
                  <vx-row-action icon="ban" [danger]="true" (selected)="suspend(admin)">Suspend account</vx-row-action>
                }
                @if (admin.accountStatus === 'Suspended') {
                  <vx-row-action icon="check" (selected)="activate(admin)">Reactivate account</vx-row-action>
                }
              </vx-row-actions>
            </li>
          }
        </ul>
      }
    </vx-section-card>

    <vx-modal [open]="inviteOpen()" title="Invite administrator" description="They receive a link that activates their account. No password is set." [dismissable]="!inviting()" (closed)="inviteOpen.set(false)">
      <div class="vx-form-grid">
        <label class="vx-field">
          <span class="vx-label vx-required">First name</span>
          <input class="vx-input" name="inviteFirstName" [value]="invite().firstName" (input)="patch({ firstName: text($event) })" />
        </label>
        <label class="vx-field">
          <span class="vx-label vx-required">Last name</span>
          <input class="vx-input" name="inviteLastName" [value]="invite().lastName" (input)="patch({ lastName: text($event) })" />
        </label>
        <label class="vx-field vx-span-2">
          <span class="vx-label vx-required">Email</span>
          <input type="email" class="vx-input" name="inviteEmail" [value]="invite().email" (input)="patch({ email: text($event) })" />
          <span class="vx-help">An existing Vexto account with no operator is reused rather than duplicated.</span>
        </label>
        <label class="vx-field">
          <span class="vx-label">Phone</span>
          <input class="vx-input" name="invitePhone" [value]="invite().phoneNumber" (input)="patch({ phoneNumber: text($event) })" />
        </label>
        <label class="vx-field">
          <span class="vx-label">Role</span>
          <select class="vx-select" name="inviteRole" [value]="invite().role" (change)="patch({ role: text($event) === 'TenantAdmin' ? 'TenantAdmin' : 'TenantOwner' })">
            <option value="TenantOwner">Tenant Owner</option>
            <option value="TenantAdmin">Tenant Admin</option>
          </select>
        </label>
      </div>
      @if (inviteError(); as message) {
        <p class="vx-error mt-3" data-testid="invite-error">{{ message }}</p>
      }
      <button footer type="button" class="vx-btn vx-btn-ghost" [disabled]="inviting()" (click)="inviteOpen.set(false)">Cancel</button>
      <button footer type="button" class="vx-btn vx-btn-primary" data-testid="send-invitation" [disabled]="inviting()" (click)="sendInvite()">
        {{ inviting() ? 'Sending…' : 'Send invitation' }}
      </button>
    </vx-modal>
  `,
})
export class CmsTenantAdministrators {
  private readonly api = inject(PlatformApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly tenantId = input.required<string>();
  readonly administrators = input.required<readonly TenantAdministrator[]>();

  /** The list changed; the parent reloads it (and the readiness summary that depends on it). */
  readonly changed = output<void>();

  protected readonly relative = formatRelative;
  protected readonly inviteOpen = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly invite = signal<InviteDraft>({ firstName: '', lastName: '', email: '', phoneNumber: '', role: 'TenantOwner' });

  protected readonly hasOwner = computed(() => this.administrators().some((admin) => admin.roles.includes('TenantOwner')));

  protected roleLabel(admin: TenantAdministrator): string {
    return admin.roles.includes('TenantOwner') ? 'Tenant Owner' : admin.roles.includes('TenantAdmin') ? 'Tenant Admin' : admin.roles.join(', ');
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected patch(change: Partial<InviteDraft>): void {
    this.invite.update((current) => ({ ...current, ...change }));
    this.inviteError.set(null);
  }

  openInvite(): void {
    this.invite.set({ firstName: '', lastName: '', email: '', phoneNumber: '', role: this.hasOwner() ? 'TenantAdmin' : 'TenantOwner' });
    this.inviteError.set(null);
    this.inviteOpen.set(true);
  }

  protected sendInvite(): void {
    const draft = this.invite();

    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      this.inviteError.set('Add the administrator’s first and last name.');

      return;
    }

    if (!EMAIL.test(draft.email.trim())) {
      this.inviteError.set('That does not look like an email address.');

      return;
    }

    this.inviting.set(true);

    this.api
      .inviteAdministrator(this.tenantId(), {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim(),
        phoneNumber: draft.phoneNumber.trim() || null,
        role: draft.role,
      })
      .subscribe({
        next: (result) => {
          this.inviting.set(false);
          this.inviteOpen.set(false);
          this.report(result.delivery, `${draft.email.trim()} has been invited.`);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.inviting.set(false);
          this.inviteError.set(error instanceof VextoApiError ? error.message : 'We could not send the invitation.');
        },
      });
  }

  protected resend(admin: TenantAdministrator): void {
    this.api.resendAdministratorInvitation(this.tenantId(), admin.userId).subscribe({
      next: (result) => {
        this.report(result.delivery, `Invitation re-sent to ${admin.email}.`);
        this.changed.emit();
      },
      error: (error: unknown) =>
        this.toast.error(error instanceof VextoApiError ? error.message : 'We could not re-send the invitation.'),
    });
  }

  protected async revoke(admin: TenantAdministrator): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Revoke this invitation?',
      message: `The link sent to ${admin.email} will stop working. The account stays and can be re-invited.`,
      confirmLabel: 'Revoke invitation',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.revokeAdministratorInvitation(this.tenantId(), admin.userId).subscribe({
      next: () => {
        this.toast.success('Invitation revoked.');
        this.changed.emit();
      },
      error: () => this.toast.error('We could not revoke the invitation.'),
    });
  }

  protected async suspend(admin: TenantAdministrator): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Suspend this administrator?',
      message: `${admin.firstName} ${admin.lastName} will be unable to sign in until reactivated.`,
      confirmLabel: 'Suspend account',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.suspendAdministrator(this.tenantId(), admin.userId).subscribe({
      next: () => {
        this.toast.success('Account suspended.');
        this.changed.emit();
      },
      error: () => this.toast.error('We could not suspend the account.'),
    });
  }

  protected activate(admin: TenantAdministrator): void {
    this.api.activateAdministrator(this.tenantId(), admin.userId).subscribe({
      next: () => {
        this.toast.success('Account reactivated.');
        this.changed.emit();
      },
      error: (error: unknown) =>
        this.toast.error(error instanceof VextoApiError ? error.message : 'We could not reactivate the account.'),
    });
  }

  /** "Failed" is said plainly: the invitation exists, the email did not go, re-send is a button. */
  private report(delivery: string, sentMessage: string): void {
    if (delivery === 'Sent') {
      this.toast.success(sentMessage);
    } else {
      this.toast.error('Invitation delivery failed. The invitation is pending — re-send it once email is working.');
    }
  }
}
