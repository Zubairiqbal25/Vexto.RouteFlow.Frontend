import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi, VextoApiError } from '@vexto/api-client';
import type { InvitationValidation } from '@vexto/models';
import { VxIcon, VxLogo } from '@vexto/ui';

/**
 * The page an invitation link opens, shared by all three apps.
 *
 * One component rather than three, because the flow is identical whoever was invited: the token
 * decides the tenant, the role and the record it attaches to, and none of that is visible here or
 * changeable from here. There is nothing to fill in. Vexto is passwordless, so the link is the
 * proof of the mailbox and pressing Activate is the whole of accepting — every later sign-in asks
 * for the same proof again, as a code sent to the same address.
 *
 * **Mobile first.** A driver or passenger opens this on a phone, from a link, probably outdoors.
 * Single column, large touch targets, no layout that needs a wide viewport.
 *
 * The token is read from the query string and never stored: not in `localStorage`, not in a
 * service, not in a log. It lives in this component for the length of the visit.
 */
@Component({
  selector: 'vx-accept-invitation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon, VxLogo],
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex justify-center">
          <vx-logo [height]="26" />
        </div>

        <section class="vx-card p-6">
          @switch (state()) {
            @case ('checking') {
              <p class="text-center text-body text-ink-muted">Checking your invitation…</p>
            }

            @case ('invalid') {
              <div class="text-center">
                <span class="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-muted">
                  <vx-icon name="alert" [size]="22" class="text-ink-muted" />
                </span>
                <h1 class="text-body font-semibold text-ink">This link no longer works</h1>
                <p class="mt-2 text-meta text-ink-muted">
                  Invitation links expire, and can only be used once. Ask your operator to send you
                  a new one.
                </p>
                <a class="vx-btn vx-btn-secondary vx-btn-touch mt-5 w-full" href="/login">
                  Go to sign in
                </a>
              </div>
            }

            @case ('done') {
              <div class="text-center">
                <span class="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-muted">
                  <vx-icon name="check-circle" [size]="22" class="text-primary" />
                </span>
                <h1 class="text-body font-semibold text-ink">Your account is active</h1>
                <p class="mt-2 text-meta text-ink-muted">
                  Sign in with {{ invitation()?.email }}. We will email you a code each time.
                </p>
                <button type="button" class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full" (click)="signIn()">
                  Sign in
                </button>
              </div>
            }

            @default {
              <h1 class="text-body font-semibold text-ink">Activate your account</h1>

              <!--
                Identity is shown so the person can see the link is genuinely for them. It is all
                the server will say about an invitation before it is redeemed: nothing here names
                the operator, the role, or the record it attaches to.
              -->
              <dl class="mt-4 flex flex-col gap-3 text-body">
                <div>
                  <dt class="vx-section-label">Name</dt>
                  <dd class="text-ink">{{ invitation()?.fullName }}</dd>
                </div>
                <div>
                  <dt class="vx-section-label">Email</dt>
                  <dd class="text-ink">{{ invitation()?.email }}</dd>
                </div>
              </dl>

              <p class="mt-4 text-meta text-ink-muted">
                No password needed. Whenever you sign in, Vexto emails a one-time code to this
                address.
              </p>

              @if (error(); as message) {
                <p class="mt-4 text-meta text-danger" role="alert">{{ message }}</p>
              }

              <button
                type="button"
                (click)="accept()"
                class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full"
                [disabled]="submitting()"
              >
                {{ submitting() ? 'Activating…' : 'Activate Account' }}
              </button>
            }
          }
        </section>
      </div>
    </main>
  `,
})
export class VxAcceptInvitationPage {
  private readonly api = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Held here only. Never persisted, never logged — it activates an account. */
  private readonly token = signal('');

  protected readonly state = signal<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  protected readonly invitation = signal<InvitationValidation | null>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!token) {
      this.state.set('invalid');

      return;
    }

    this.token.set(token);

    // Validated before the button is shown, so somebody with a dead link is told immediately.
    this.api.validateInvitation(token).subscribe({
      next: (result) => {
        this.invitation.set(result);
        this.state.set(result.isValid ? 'ready' : 'invalid');
      },

      // An unreachable API and an invalid token look the same here, and both mean the person
      // cannot continue. The wording covers either.
      error: () => this.state.set('invalid'),
    });
  }

  protected accept(): void {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.api.acceptInvitation({ token: this.token() }).subscribe({
      next: () => {
        this.submitting.set(false);

        // The token is spent; drop it before anything else can read it back out of the URL.
        this.token.set('');
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });

        this.state.set('done');
      },
      error: (error: unknown) => {
        this.submitting.set(false);

        // A rejected token means the link died between validating and submitting, which is rare
        // but real.
        this.error.set(
          error instanceof VextoApiError
            ? error.message
            : 'We could not activate your account. Your link may have expired.',
        );
      },
    });
  }

  /** On to sign-in with the address filled in and a code already on its way. */
  protected signIn(): void {
    const email = this.invitation()?.email;

    void this.router.navigate(['/login'], {
      queryParams: email ? { email, sendCode: '1' } : {},
    });
  }
}
