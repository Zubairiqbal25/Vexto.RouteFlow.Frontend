import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VxLogo, VxToastHost } from '@vexto/ui';

/**
 * The signed-out shell: a centred card on the left, a brand panel on the right.
 *
 * The brand panel is hidden below `lg`, where the card takes the whole screen — a driver signing in
 * on a phone at 5am does not need marketing copy.
 */
@Component({
  selector: 'vx-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, VxToastHost, VxLogo],
  template: `
    <div class="flex min-h-screen bg-surface">
      <div class="flex flex-1 items-center justify-center p-6">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex items-center">
            <vx-logo [height]="26" />
          </div>
          <router-outlet />
        </div>
      </div>

      <div
        class="relative hidden w-[46%] max-w-2xl flex-col justify-end overflow-hidden p-12 text-white lg:flex"
        style="background: linear-gradient(150deg, var(--vexto-nav-bg) 0%, var(--vexto-primary-active) 140%)"
        aria-hidden="true"
      >
        <div
          class="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-25"
          style="background: radial-gradient(circle, var(--vexto-primary-300) 0%, transparent 65%)"
        ></div>
        <!-- Monochrome white: the panel's ground is a brand-coloured gradient, and the teal mark on
             teal is the one place the coloured lockup stops working. The whole panel is
             aria-hidden, so this repeats nothing to a screen reader. -->
        <vx-logo class="mb-auto self-start" variant="horizontal" tone="mono" [height]="24" label="" />

        <p class="mt-10 max-w-md text-2xl font-semibold leading-snug tracking-tight text-white">
          {{ headlineText() }}
        </p>
        <p class="mt-3 max-w-md text-body" style="color: var(--vexto-nav-text)">
          {{ subheadlineText() }}
        </p>
      </div>

      <vx-toast-host />
    </div>
  `,
})
export class VxAuthShell {
  // Optional, with the fallbacks in computed signals: the router binds every input on a routed
  // component and passes undefined for keys the route does not supply, which would otherwise
  // silently blank an input's default.
  readonly headline = input<string | undefined>(undefined);
  readonly subheadline = input<string | undefined>(undefined);

  protected readonly headlineText = computed(
    () => this.headline() ?? 'Employee transport, run properly.',
  );

  protected readonly subheadlineText = computed(
    () =>
      this.subheadline() ??
      'Routes, drivers, vehicles and live fleet tracking for licensed transport operators across the UAE.',
  );
}
