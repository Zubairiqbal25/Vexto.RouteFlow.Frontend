import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, AuthStore } from '@vexto/auth';
import { PermissionService } from '@vexto/permissions';
import { VxAvatar, VxIcon, VxThemeToggle } from '@vexto/ui';
import { VxNotificationBell } from './vx-notification-bell';
import { VxTenantSelector } from './vx-tenant-selector';

/**
 * The operator portal's top bar.
 *
 * Reads left to right as: where am I, what am I looking for, which operator, and who am I. The
 * middle is a jump box rather than a search field — it opens the command palette, and it says so
 * with a visible ⌘K hint, because an input that looks like search and does navigation is a promise
 * the product does not keep.
 *
 * Kept visually light: one border, no shadow, and a translucent background so content scrolling
 * beneath it reads as the page moving rather than as a separate panel.
 *
 * **No `backdrop-blur` on the header, deliberately.** `backdrop-filter` makes an element a
 * containing block for its fixed-position descendants, and the notification bell in this bar opens a
 * `vx-drawer` — which is `position: fixed` and expects the viewport. With the blur on, that drawer
 * was laid out against this 64px-tall header and rendered as a squashed sliver in the corner. The
 * translucency that actually mattered comes from `color-mix`, which has no such side effect.
 */
@Component({
  selector: 'vx-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    VxAvatar,
    VxIcon,
    VxNotificationBell,
    VxTenantSelector,
    VxThemeToggle,
  ],
  host: { '(document:click)': 'menuOpen = false' },
  template: `
    <!-- No backdrop-blur here, deliberately. See the note on this class. -->
    <header
      class="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line px-4 sm:px-6"
      style="background: color-mix(in srgb, var(--vexto-surface) 94%, transparent)"
    >
      <button
        type="button"
        class="vx-btn vx-btn-ghost vx-btn-icon xl:hidden"
        aria-label="Open navigation"
        (click)="menuToggled.emit()"
      >
        <vx-icon name="menu" [size]="20" />
      </button>

      <!-- Opens the palette. A button, not an input: it does not accept text of its own, and
           dressing it as a field would suggest results appear beneath it. -->
      <button
        type="button"
        class="hidden min-w-0 items-center gap-2 rounded-lg border border-line px-3 py-2 text-body
               text-ink-muted transition-colors hover:bg-surface-hover md:flex md:w-72"
        style="background: var(--vexto-surface-muted)"
        (click)="paletteRequested.emit()"
      >
        <vx-icon name="search" [size]="16" />
        <span class="flex-1 text-start">Jump to…</span>
        <span
          class="rounded border border-line px-1.5 py-0.5 text-[0.6875rem] font-medium"
          style="background: var(--vexto-surface)"
          >⌘K</span
        >
      </button>

      <div class="ms-auto flex items-center gap-1.5">
        <vx-tenant-selector />
        <vx-theme-toggle />
        <vx-notification-bell />

        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-2 rounded-full p-1 pe-2 hover:bg-surface-hover"
            [attr.aria-expanded]="menuOpen"
            aria-haspopup="menu"
            aria-label="Account menu"
            (click)="toggleMenu($event)"
          >
            <vx-avatar size="sm" [name]="firstName()" [secondName]="lastName()" />
            <span class="hidden text-body font-medium text-ink-secondary sm:block">
              {{ firstName() }}
            </span>
            <vx-icon name="chevron-down" [size]="15" />
          </button>

          @if (menuOpen) {
            <div
              role="menu"
              class="vx-card absolute end-0 z-40 mt-2 w-64 py-1 shadow-pop"
              style="background: var(--vexto-surface-raised)"
            >
              <div class="border-b border-line-subtle px-4 py-3">
                <p class="truncate text-body font-medium text-ink">
                  {{ firstName() }} {{ lastName() }}
                </p>
                <p class="truncate text-meta text-ink-muted">{{ email() }}</p>

                @if (isServiceAdmin()) {
                  <span
                    class="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
                    style="background: var(--vexto-primary-soft); color: var(--vexto-primary-active)"
                  >
                    <vx-icon name="shield" [size]="12" />
                    Vexto platform administrator
                  </span>
                }
              </div>

              <a
                role="menuitem"
                routerLink="/settings"
                class="flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-body text-ink-secondary hover:bg-surface-hover"
              >
                <vx-icon name="settings" [size]="16" />
                Settings
              </a>

              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-body text-ink-secondary hover:bg-surface-hover"
                (click)="signOut()"
              >
                <vx-icon name="logout" [size]="16" />
                Sign out
              </button>
            </div>
          }
        </div>
      </div>
    </header>
  `,
})
export class VxTopbar {
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);

  readonly menuToggled = output<void>();
  readonly paletteRequested = output<void>();

  /** Unused today; kept so a page can push a context title into the bar without a new component. */
  readonly contextTitle = input<string | null>(null);

  protected menuOpen = false;

  protected readonly firstName = computed(() => this.store.user()?.firstName ?? '');
  protected readonly lastName = computed(() => this.store.user()?.lastName ?? '');
  protected readonly email = computed(() => this.store.user()?.email ?? '');
  protected readonly isServiceAdmin = this.permissions.isServiceAdmin;

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
