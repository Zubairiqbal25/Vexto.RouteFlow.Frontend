import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, AuthStore } from '@vexto/auth';
import { VxConfirmHost, VxIcon, VxThemeToggle, VxToastHost } from '@vexto/ui';
import type { NavItem } from './navigation';
import { VxNotificationBell } from './vx-notification-bell';

/**
 * The shell for the driver and passenger apps.
 *
 * Not the operator portal squeezed onto a phone: a fixed header, a full-bleed scrolling body and a
 * thumb-reachable tab bar at the bottom. Tabs are at least 56px tall because the driver app is used
 * one-handed, in a vehicle, with the engine running.
 *
 * With a single tab the bar is hidden entirely rather than showing a lone, pointless button.
 */
@Component({
  selector: 'vx-mobile-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    VxIcon,
    VxNotificationBell,
    VxThemeToggle,
    VxToastHost,
    VxConfirmHost,
  ],
  template: `
    <div class="flex min-h-dvh flex-col bg-bg">
      <header
        class="sticky top-0 z-30 flex flex-none items-center gap-3 px-4 py-3.5 text-white"
        style="background: var(--vexto-nav-bg)"
      >
        <span
          class="flex size-9 flex-none items-center justify-center rounded-xl text-sm font-bold"
          style="background: linear-gradient(135deg, var(--vexto-primary) 0%, var(--vexto-primary-active) 100%)"
          >V</span
        >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[0.9375rem] font-semibold leading-tight">{{ title() }}</p>
          <p class="truncate text-meta" style="color: var(--vexto-nav-text)">{{ subtitle() }}</p>
        </div>
        <!--
          The same bell as the operator portal. Every notification route resolves its recipient
          from the token, so a driver and a passenger each read exactly their own — which is why
          this belongs in the shell rather than being built twice inside two apps.
        -->
        <span class="flex-none" style="color: var(--vexto-nav-text)">
          <vx-theme-toggle />
        </span>

        <vx-notification-bell tone="onDark" />

        <button
          type="button"
          class="flex size-10 flex-none items-center justify-center rounded-lg"
          style="color: var(--vexto-nav-text)"
          aria-label="Sign out"
          (click)="signOut()"
        >
          <vx-icon name="logout" [size]="20" />
        </button>
      </header>

      <main class="flex-1 pb-24">
        <router-outlet />
      </main>

      @if (tabs().length > 1) {
        <nav
          class="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
          aria-label="Sections"
        >
          @for (tab of tabs(); track tab.link) {
            <a
              class="relative flex flex-1 flex-col items-center justify-center gap-1 py-3 text-meta
                     font-medium text-ink-muted transition-colors"
              [routerLink]="tab.link"
              routerLinkActive="vx-tab-active"
              [routerLinkActiveOptions]="{ exact: tab.exact ?? false }"
              style="min-height: 56px"
            >
              <vx-icon [name]="tab.icon" [size]="22" />
              {{ tab.label }}
            </a>
          }
        </nav>
      }

      <vx-toast-host />
      <vx-confirm-host />
    </div>
  `,
})
export class VxMobileShell {
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);

  readonly tabs = input<readonly NavItem[]>([]);
  readonly title = input.required<string>();

  protected readonly subtitle = computed(() => {
    const user = this.store.user();

    return user ? `${user.firstName} ${user.lastName}` : '';
  });

  protected signOut(): void {
    this.auth.logout();
  }
}
