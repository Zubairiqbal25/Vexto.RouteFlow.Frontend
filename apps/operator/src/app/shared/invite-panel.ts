import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { VextoApiError } from '@vexto/api-client';
import type { AccountStatus } from '@vexto/models';
import { ToastService, VxStatusBadge } from '@vexto/ui';
import { Observable } from 'rxjs';

/**
 * What the panel needs to talk to whichever API it is showing.
 *
 * The passenger and driver invitation surfaces are the same four calls with different URLs, so the
 * panel takes them as functions rather than existing twice. That keeps one place to get the states
 * and the wording right.
 */
export interface InvitationGateway {
  status(): Observable<{ accountStatus: string; email: string | null; invitationExpiresAtUtc: string | null }>;
  invite(email: string): Observable<{ accountStatus: string; acceptUrl?: string | null }>;
  resend(): Observable<{ accountStatus: string; acceptUrl?: string | null }>;
  revoke(): Observable<void>;
}

/**
 * The app-access panel on a passenger or driver detail screen.
 *
 * **There is no password field here, and there will not be one.** An administrator inviting
 * somebody supplies an address; the person sets their own password from a one-time link. That is
 * the whole point of the invitation flow, and a UI that still offered to choose a password for
 * somebody else would quietly keep the old habit alive.
 *
 * The acceptance link is shown only when the API returns one, which it does only in Development.
 * In production it goes to the invitee through delivery and appears nowhere in this screen — it is
 * a credential.
 */
@Component({
  selector: 'vexto-invite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxStatusBadge],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="vx-section-label">App access</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <vx-status-badge [tone]="badgeTone()" [label]="badgeLabel()" />

          @if (email(); as address) {
            <span class="text-meta text-ink-muted">{{ address }}</span>
          }
        </div>

        @if (expiry(); as expires) {
          <p class="mt-1 text-meta text-ink-muted">Link expires {{ expires }}</p>
        }
      </div>

      <div class="flex flex-wrap gap-2">
        @switch (status()) {
          @case ('NotInvited') {
            <button type="button" class="vx-btn vx-btn-primary" (click)="open()">
              Invite to app
            </button>
          }

          @case ('Active') {
            <!-- Nothing to do: they are already signed in and using it. -->
          }

          @default {
            <button
              type="button"
              class="vx-btn vx-btn-secondary"
              [disabled]="busy()"
              (click)="resend()"
            >
              Resend invitation
            </button>

            @if (status() === 'InvitationPending') {
              <button
                type="button"
                class="vx-btn vx-btn-ghost"
                [disabled]="busy()"
                (click)="revoke()"
              >
                Revoke
              </button>
            }
          }
        }
      </div>
    </div>

    @if (formOpen()) {
      <form class="mt-4 flex flex-wrap items-end gap-3" (submit)="invite($event)">
        <label class="min-w-56 flex-1">
          <span class="vx-section-label">Email address</span>
          <input
            class="vx-input mt-1 w-full"
            type="email"
            required
            placeholder="name@example.com"
            aria-label="Invitation email address"
            [value]="draftEmail()"
            (input)="draftEmail.set(text($event))"
          />
        </label>

        <button type="submit"
          (click)="invite($event)" class="vx-btn vx-btn-primary" [disabled]="busy()">
          {{ busy() ? 'Sending…' : 'Send invitation' }}
        </button>
        <button type="button" class="vx-btn vx-btn-ghost" [disabled]="busy()" (click)="formOpen.set(false)">
          Cancel
        </button>
      </form>
    }

    @if (lastLink(); as link) {
      <div class="mt-4 rounded-xl border border-line-subtle bg-surface-muted p-4">
        <p class="text-meta font-medium text-ink">
          Development only: this link is not returned in production.
        </p>
        <p class="mt-1 break-all text-meta text-ink-secondary">{{ link }}</p>
      </div>
    }
  `,
})
export class InvitePanel {
  private readonly toast = inject(ToastService);

  readonly gateway = input.required<InvitationGateway>();

  /** What the person is called, for the toast. Purely cosmetic. */
  readonly subject = input('this person');

  protected readonly status = signal<AccountStatus>('NotInvited');
  protected readonly email = signal<string | null>(null);
  protected readonly expiry = signal<string | null>(null);
  protected readonly draftEmail = signal('');
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly lastLink = signal<string | null>(null);

  protected readonly badgeTone = computed(() => {
    switch (this.status()) {
      case 'Active':
        return 'success' as const;
      case 'InvitationPending':
        return 'warning' as const;
      case 'Suspended':
        return 'danger' as const;
      default:
        return 'neutral' as const;
    }
  });

  protected readonly badgeLabel = computed(() => {
    switch (this.status()) {
      case 'Active':
        return 'App active';
      case 'InvitationPending':
        return 'Invitation pending';
      case 'InvitationExpired':
        return 'Invitation expired';
      case 'Suspended':
        return 'Account suspended';
      default:
        return 'Not invited';
    }
  });

  /** Called by the host screen once its own record has loaded. */
  load(): void {
    this.gateway()
      .status()
      .subscribe({
        next: (result) => this.apply(result.accountStatus, result.email, result.invitationExpiresAtUtc),

        // A status that cannot be read leaves the panel saying "not invited", which is the safe
        // reading: the worst outcome is an operator offered an invite that then reports a conflict.
        error: () => this.status.set('NotInvited'),
      });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected open(): void {
    this.draftEmail.set('');
    this.lastLink.set(null);
    this.formOpen.set(true);
  }

  protected invite(event: Event): void {
    event.preventDefault();

    if (this.busy() || this.draftEmail().length === 0) {
      return;
    }

    this.busy.set(true);

    this.gateway()
      .invite(this.draftEmail())
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.apply(result.accountStatus, this.draftEmail(), null);
          this.lastLink.set(result.acceptUrl ?? null);
          this.toast.success(`Invitation sent to ${this.draftEmail()}.`);
        },
        error: (error: unknown) => this.fail(error, 'We could not send that invitation.'),
      });
  }

  protected resend(): void {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);

    this.gateway()
      .resend()
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.apply(result.accountStatus, this.email(), null);
          this.lastLink.set(result.acceptUrl ?? null);
          this.toast.success('Invitation sent again.');
        },
        error: (error: unknown) => this.fail(error, 'We could not re-send that invitation.'),
      });
  }

  protected revoke(): void {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);

    this.gateway()
      .revoke()
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.lastLink.set(null);
          this.toast.success('Invitation withdrawn.');
          this.load();
        },
        error: (error: unknown) => this.fail(error, 'We could not withdraw that invitation.'),
      });
  }

  private apply(status: string, email: string | null, expiresAtUtc: string | null): void {
    this.status.set(status as AccountStatus);
    this.email.set(email);

    this.expiry.set(
      expiresAtUtc === null ? null : new Date(expiresAtUtc).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
    );
  }

  private fail(error: unknown, fallback: string): void {
    this.busy.set(false);

    // The API answers 409 with a readable reason — already invited, already active — so it is
    // shown rather than replaced with something generic.
    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
