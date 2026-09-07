import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi, VextoApiError } from '@vexto/api-client';
import type { InvitationValidation } from '@vexto/models';
import { VxIcon } from '@vexto/ui';

/**
 * The page an invitation link opens, shared by all three apps.
 *
 * One component rather than three, because the flow is identical whoever was invited: the token
 * decides the tenant, the role and the record it attaches to, and none of that is visible here or
 * changeable from here. The page asks for one thing — a password — because that is genuinely the
 * only thing the invitee gets to decide.
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
  imports: [VxIcon],
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 text-center">
          <p class="text-xl font-semibold tracking-tight text-ink">Vexto</p>
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
                <h1 class="text-body font-semibold text-ink">Your account is ready</h1>
                <p class="mt-2 text-meta text-ink-muted">
                  Sign in with {{ invitation()?.email }} and the password you just chose.
                </p>
                <a class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full" href="/login">
                  Sign in
                </a>
              </div>
            }

            @default {
              <h1 class="text-body font-semibold text-ink">Set your password</h1>

              <!--
                Identity is shown so the person can see the link is genuinely for them. It is all
                the server will say about an invitation before it is redeemed: nothing here names
                the operator, the role, or the record it attaches to.
              -->
              <p class="mt-1 text-meta text-ink-muted">
                {{ invitation()?.fullName }} · {{ invitation()?.email }}
              </p>

              <form class="mt-5" (submit)="accept($event)">
                <label class="block">
                  <span class="vx-section-label">New password</span>
                  <input
                    class="vx-input mt-1 w-full"
                    type="password"
                    autocomplete="new-password"
                    required
                    minlength="12"
                    aria-describedby="password-help"
                    [value]="password()"
                    (input)="password.set(text($event))"
                  />
                </label>

                <p id="password-help" class="mt-1.5 text-meta text-ink-muted">
                  At least 12 characters, with upper and lower case, a number and a symbol.
                </p>

                <label class="mt-4 block">
                  <span class="vx-section-label">Confirm password</span>
                  <input
                    class="vx-input mt-1 w-full"
                    type="password"
                    autocomplete="new-password"
                    required
                    [value]="confirmation()"
                    (input)="confirmation.set(text($event))"
                  />
                </label>

                @if (error(); as message) {
                  <p class="mt-4 text-meta text-danger" role="alert">{{ message }}</p>
                }

                <button
                  type="submit"
          (click)="accept($event)"
                  class="vx-btn vx-btn-primary vx-btn-touch mt-5 w-full"
                  [disabled]="submitting()"
                >
                  {{ submitting() ? 'Setting your password…' : 'Set password and continue' }}
                </button>
              </form>
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

  /** Held here only. Never persisted, never logged — it sets a password on an account. */
  private readonly token = signal('');

  protected readonly state = signal<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  protected readonly invitation = signal<InvitationValidation | null>(null);
  protected readonly password = signal('');
  protected readonly confirmation = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () => this.password().length >= 12 && this.password() === this.confirmation(),
  );

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!token) {
      this.state.set('invalid');

      return;
    }

    this.token.set(token);

    // Validated before the form is shown, so somebody with a dead link is told immediately rather
    // than after thinking of a password.
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

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected accept(event: Event): void {
    event.preventDefault();

    if (this.submitting()) {
      return;
    }

    if (this.password() !== this.confirmation()) {
      this.error.set('Those passwords do not match.');

      return;
    }

    if (this.password().length < 12) {
      this.error.set('Your password needs to be at least 12 characters.');

      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.api.acceptInvitation({ token: this.token(), password: this.password() }).subscribe({
      next: () => {
        this.submitting.set(false);

        // The token is spent; drop it before anything else can read it back out of the URL.
        this.token.set('');
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });

        this.state.set('done');
      },
      error: (error: unknown) => {
        this.submitting.set(false);

        // The server rejects a weak password with a readable reason, so it is shown. A rejected
        // token means the link died between validating and submitting, which is rare but real.
        this.error.set(
          error instanceof VextoApiError
            ? error.message
            : 'We could not set your password. Your link may have expired.',
        );
      },
    });
  }
}
