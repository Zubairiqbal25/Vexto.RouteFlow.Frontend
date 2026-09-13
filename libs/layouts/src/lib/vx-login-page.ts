import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VextoApiError } from '@vexto/api-client';
import { AuthService } from '@vexto/auth';
import type { AuthenticatedUser } from '@vexto/models';
import { VxField, VxIcon, VxOtpInput } from '@vexto/ui';

/**
 * The sign-in screen, shared by all three apps. Passwordless: an email, then the code it was sent.
 *
 * One component because the mechanics are identical — ask for a code, present it, honour
 * returnUrl — and the differences are two sentences of copy and the size of the boxes, which are
 * inputs. There is no password anywhere on this screen and no "forgot password" link, because
 * there is no password to forget.
 *
 * **Where the person lands is decided by the session, not by which app they opened.** A
 * ServiceAdmin who signs in to the operator portal is sent to the platform dashboard; everybody
 * else goes to the app's home. The apps themselves are separate origins, so a driver signing in on
 * the driver app lands on the driver home — the routing here only chooses within the app.
 */
@Component({
  selector: 'vx-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxField, VxIcon, VxOtpInput],
  host: { class: 'block' },
  template: `
    @if (step() === 'email') {
      <section class="vx-login-step" aria-labelledby="login-title">
        <h1 id="login-title" class="text-xl font-semibold tracking-tight text-ink">Welcome back</h1>
        <p class="mt-1.5 text-body text-ink-muted">{{ subtitleText() }}</p>

        <form class="mt-8 flex flex-col gap-5" [formGroup]="emailForm" (ngSubmit)="requestCode()">
          @if (formError(); as message) {
            <div
              class="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body"
              style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
              role="alert"
            >
              <vx-icon name="alert" [size]="17" />
              <span>{{ message }}</span>
            </div>
          }

          <vx-field label="Email address" for="email" [required]="true" [control]="emailForm.controls.email">
            <input
              id="email"
              type="email"
              class="vx-input"
              autocomplete="email"
              inputmode="email"
              autocapitalize="none"
              spellcheck="false"
              formControlName="email"
              [attr.aria-invalid]="emailForm.controls.email.touched && emailForm.controls.email.invalid"
            />
          </vx-field>

          <button
            type="submit"
            class="vx-btn vx-btn-primary mt-1"
            [class.vx-btn-lg]="!large()"
            [class.vx-btn-touch]="large()"
            [disabled]="busy()"
          >
            {{ busy() ? 'Sending code…' : 'Continue' }}
          </button>
        </form>

        <p class="mt-8 text-meta text-ink-muted">{{ footnoteText() }}</p>
      </section>
    } @else {
      <section class="vx-login-step" aria-labelledby="code-title">
        <h1 id="code-title" class="text-xl font-semibold tracking-tight text-ink">Check your email</h1>
        <p class="mt-1.5 text-body text-ink-muted">
          We sent a {{ codeLength() }}-digit verification code to
          <span class="font-medium text-ink">{{ maskedEmail() }}</span>
        </p>

        <form class="mt-8 flex flex-col gap-5" (submit)="verifyCode($event)">
          @if (formError(); as message) {
            <div
              class="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body"
              style="background: var(--vexto-danger-soft); color: var(--vexto-danger-text)"
              role="alert"
            >
              <vx-icon name="alert" [size]="17" />
              <span>{{ message }}</span>
            </div>
          }

          <vx-otp-input
            #otp
            [length]="codeLength()"
            [(value)]="code"
            [disabled]="busy()"
            [invalid]="codeInvalid()"
            [size]="large() ? 'large' : 'default'"
            (completed)="verifyCode()"
          />

          <button
            type="submit"
            class="vx-btn vx-btn-primary mt-1"
            [class.vx-btn-lg]="!large()"
            [class.vx-btn-touch]="large()"
            [disabled]="busy() || code().length < codeLength()"
          >
            {{ busy() ? 'Verifying…' : 'Verify & Continue' }}
          </button>
        </form>

        <div class="mt-6 flex flex-col gap-2 text-meta text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          @if (resendIn() > 0) {
            <span aria-live="polite">Resend code in {{ resendIn() }}s</span>
          } @else {
            <button type="button" class="vx-link" (click)="resend()" [disabled]="busy()">
              Resend code
            </button>
          }

          <button type="button" class="vx-link" (click)="useAnotherEmail()" [disabled]="busy()">
            Use another email
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    .vx-login-step {
      animation: vx-login-enter 180ms ease-out;
    }

    @keyframes vx-login-enter {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .vx-link {
      color: var(--vexto-primary);
      font-weight: 500;
      text-align: left;
    }

    .vx-link:hover:not(:disabled) {
      text-decoration: underline;
    }

    .vx-link:disabled {
      opacity: 0.6;
    }

    @media (prefers-reduced-motion: reduce) {
      .vx-login-step {
        animation: none;
      }
    }
  `,
})
export class VxLoginPage {
  // Each app supplies its own copy through route data, so one component serves all three without
  // looking generic.
  //
  // These are optional, and the fallbacks live in the computed signals below rather than in the
  // input defaults: `withComponentInputBinding` sets *every* input on a routed component, passing
  // undefined for keys the route does not provide, which silently discards an input's default.
  readonly subtitle = input<string | undefined>(undefined);
  readonly footnote = input<string | undefined>(undefined);
  /** Where to go when there is no returnUrl to honour. */
  readonly home = input<string | undefined>(undefined);
  /**
   * Where a ServiceAdmin lands. Only the operator portal has a platform surface; the other apps
   * leave this unset and a platform administrator lands on their home like anybody else.
   */
  readonly platformHome = input<string | undefined>(undefined);
  /** Tablet-sized controls, for the driver app. */
  readonly large = input<boolean | undefined>(undefined);

  protected readonly subtitleText = computed(
    () => this.subtitle() ?? 'Enter your email and we will send you a sign-in code.',
  );

  protected readonly footnoteText = computed(
    () =>
      this.footnote() ??
      'Vexto accounts are created by your operator administrator. Contact them if you cannot sign in.',
  );

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly otp = viewChild<VxOtpInput>('otp');

  protected readonly step = signal<'email' | 'code'>('email');
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly codeInvalid = signal(false);

  /** The address a code was sent to. Shown masked; sent in full with the code. */
  protected readonly email = signal('');
  protected readonly code = signal('');
  protected readonly codeLength = signal(6);
  protected readonly resendIn = signal(0);

  protected readonly maskedEmail = computed(() => maskEmail(this.email()));

  protected readonly emailForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  private countdown: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // An acceptance page, or a link in an email, may bring the address along. Prefilled and, when
    // asked, the code is requested straight away so the person has one thing to do.
    const params = this.route.snapshot.queryParamMap;
    const prefilled = params.get('email');

    if (prefilled) {
      this.emailForm.controls.email.setValue(prefilled);

      if (params.get('sendCode') === '1') {
        this.requestCode();
      }
    }

    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  protected requestCode(): void {
    if (this.emailForm.invalid || this.busy()) {
      this.emailForm.markAllAsTouched();

      return;
    }

    const email = this.emailForm.getRawValue().email.trim();

    this.busy.set(true);
    this.formError.set(null);

    this.auth.requestOtp(email).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.email.set(email);
        this.code.set('');
        this.codeInvalid.set(false);
        this.codeLength.set(response.codeLength);
        this.step.set('code');
        this.startCountdown(response.resendCooldownSeconds);

        // The step has just rendered; give the boxes a tick to exist before focusing them.
        setTimeout(() => this.otp()?.focus(), 0);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(
          error instanceof VextoApiError && error.status === 429
            ? 'Too many attempts from this connection. Wait a minute and try again.'
            : error instanceof VextoApiError && error.kind !== 'unknown'
              ? error.message
              : 'We could not send a code. Please try again.',
        );
      },
    });
  }

  protected verifyCode(event?: Event): void {
    event?.preventDefault();

    const code = this.code();

    if (this.busy() || code.length < this.codeLength()) {
      return;
    }

    this.busy.set(true);
    this.formError.set(null);
    this.codeInvalid.set(false);

    this.auth.verifyOtp(this.email(), code).subscribe({
      next: (session) => {
        this.stopCountdown();
        void this.router.navigateByUrl(this.destinationFor(session.user));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.codeInvalid.set(true);
        this.otp()?.clear();
        // 401 is a wrong, spent or expired code and 403 an account that may not sign in; both
        // carry a sentence written for the person, so it is shown as is.
        this.formError.set(
          error instanceof VextoApiError && error.kind !== 'unknown' && error.message
            ? error.message
            : 'We could not verify the code. Please try again.',
        );
      },
    });
  }

  /** Asks for another code. The server may decline silently inside its own cooldown; that is fine. */
  protected resend(): void {
    if (this.busy() || this.resendIn() > 0) {
      return;
    }

    this.busy.set(true);
    this.formError.set(null);

    this.auth.requestOtp(this.email()).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.codeInvalid.set(false);
        this.startCountdown(response.resendCooldownSeconds);
        this.otp()?.clear();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(
          error instanceof VextoApiError && error.status === 429
            ? 'Too many attempts from this connection. Wait a minute and try again.'
            : 'We could not send a new code. Please try again.',
        );
      },
    });
  }

  /** Back to the first step, keeping what was typed so a typo is a two-character fix. */
  protected useAnotherEmail(): void {
    this.stopCountdown();
    this.code.set('');
    this.codeInvalid.set(false);
    this.formError.set(null);
    this.step.set('email');
  }

  /**
   * A guard may have sent the user here with where they were going; honour it. Otherwise the
   * session decides: a platform administrator goes to the platform, everybody else home.
   */
  private destinationFor(user: AuthenticatedUser): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (returnUrl) {
      return returnUrl;
    }

    if (user.isServiceAdmin && this.platformHome()) {
      return this.platformHome()!;
    }

    return this.home() ?? '/';
  }

  private startCountdown(seconds: number): void {
    this.stopCountdown();
    this.resendIn.set(Math.max(0, seconds));

    if (seconds <= 0) {
      return;
    }

    this.countdown = setInterval(() => {
      const remaining = this.resendIn() - 1;
      this.resendIn.set(remaining);

      if (remaining <= 0) {
        this.stopCountdown();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdown !== null) {
      clearInterval(this.countdown);
      this.countdown = null;
    }

    this.resendIn.set(0);
  }
}

/** `zubairiqbal25@gmail.com` → `zu***@gmail.com`: enough to recognise, not enough to copy. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');

  if (at <= 0) {
    return email;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length <= 2 ? 1 : 2;

  return `${local.slice(0, keep)}***${domain}`;
}
