import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VextoApiError } from '@vexto/api-client';
import { AuthService } from '@vexto/auth';
import { VxField, VxIcon } from '@vexto/ui';

/**
 * The sign-in screen, shared by all three apps.
 *
 * One component because the mechanics are identical — validate, call the API, honour returnUrl — and
 * the differences are two sentences of copy, which are inputs.
 */
@Component({
  selector: 'vx-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, VxField, VxIcon],
  template: `
    <h1 class="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
    <p class="mt-1.5 text-body text-ink-muted">{{ subtitleText() }}</p>

    <form class="mt-8 flex flex-col gap-5" [formGroup]="form" (ngSubmit)="submit()">
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

      <vx-field label="Email" for="email" [required]="true" [control]="form.controls.email">
        <input
          id="email"
          type="email"
          class="vx-input"
          autocomplete="username"
          formControlName="email"
          [attr.aria-invalid]="form.controls.email.touched && form.controls.email.invalid"
        />
      </vx-field>

      <vx-field label="Password" for="password" [required]="true" [control]="form.controls.password">
        <input
          id="password"
          type="password"
          class="vx-input"
          autocomplete="current-password"
          formControlName="password"
          [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid"
        />
      </vx-field>

      <button type="submit" class="vx-btn vx-btn-primary vx-btn-lg mt-1" [disabled]="busy()">
        {{ busy() ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="mt-8 text-meta text-ink-muted">{{ footnoteText() }}</p>
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

  protected readonly subtitleText = computed(
    () => this.subtitle() ?? 'Welcome back. Sign in to your operator portal.',
  );

  protected readonly footnoteText = computed(
    () =>
      this.footnote() ??
      'Vexto accounts are created by your operator administrator. Contact them if you cannot sign in.',
  );

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();

      return;
    }

    this.busy.set(true);
    this.formError.set(null);

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        // A guard sent the user here with where they were going; honour it.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? this.home() ?? '/';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(
          error instanceof VextoApiError && error.kind !== 'unknown'
            ? // 401 on sign-in is a wrong password, not an expired session.
              error.status === 401
              ? 'That email and password do not match an account.'
              : error.message
            : 'We could not sign you in. Please try again.',
        );
      },
    });
  }
}
