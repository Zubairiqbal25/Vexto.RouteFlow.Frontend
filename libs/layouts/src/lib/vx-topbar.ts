import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AuthService, AuthStore } from '@vexto/auth';
import { VxAvatar, VxIcon } from '@vexto/ui';
import { VxNotificationBell } from './vx-notification-bell';

/**
 * The operator portal's top bar: which operator you are working in, who you are, and the way out.
 *
 * The tenant name is shown deliberately and permanently. Vexto is multi-tenant, and someone who
 * administers two operators must never be in doubt about which one they are editing.
 *
 * The bell is the real one: it reads `/api/v1/notifications`, which resolves its recipient from the
 * token, so this same component serves the operator portal and both mobile apps.
 */
@Component({
  selector: 'vx-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxAvatar, VxIcon, VxNotificationBell],
  host: { '(document:click)': 'menuOpen = false' },
  template: `
    <header
      class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6"
    >
      <button
        type="button"
        class="vx-btn vx-btn-ghost vx-btn-icon xl:hidden"
        aria-label="Open navigation"
        (click)="menuToggled.emit()"
      >
        <vx-icon name="menu" [size]="20" />
      </button>

      <div class="relative hidden min-w-0 flex-1 md:block md:max-w-sm">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
          <vx-icon name="search" [size]="16" />
        </span>
        <input
          type="search"
          class="vx-input pl-9"
          placeholder="Search Vexto"
          aria-label="Search Vexto"
          disabled
        />
      </div>

      <div class="ms-auto flex items-center gap-1.5">
        @if (tenantName(); as tenant) {
          <span
            class="hidden items-center gap-2 rounded-full border border-line bg-surface-muted px-3 py-1.5 text-meta font-medium text-ink-secondary sm:inline-flex"
          >
            <vx-icon name="shield" [size]="14" />
            {{ tenant }}
          </span>
        }

        <vx-notification-bell />

        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-surface-hover"
            [attr.aria-expanded]="menuOpen"
            aria-haspopup="menu"
            (click)="toggleMenu($event)"
          >
            <vx-avatar size="sm" [name]="firstName()" [secondName]="lastName()" />
            <span class="hidden text-body font-medium text-ink-secondary sm:block">
              {{ firstName() }}
            </span>
            <vx-icon name="chevron-down" [size]="15" />
          </button>

          @if (menuOpen) {
            <div role="menu" class="vx-card absolute right-0 z-40 mt-2 w-60 py-1 shadow-pop">
              <div class="border-b border-line-subtle px-4 py-3">
                <p class="truncate text-body font-medium text-ink">
                  {{ firstName() }} {{ lastName() }}
                </p>
                <p class="truncate text-meta text-ink-muted">{{ email() }}</p>
              </div>
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

  readonly menuToggled = output<void>();
  /** Unused today; kept so a page can push a context title into the bar without a new component. */
  readonly contextTitle = input<string | null>(null);

  protected menuOpen = false;

  protected readonly tenantName = this.store.tenantName;
  protected readonly firstName = computed(() => this.store.user()?.firstName ?? '');
  protected readonly lastName = computed(() => this.store.user()?.lastName ?? '');
  protected readonly email = computed(() => this.store.user()?.email ?? '');

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
