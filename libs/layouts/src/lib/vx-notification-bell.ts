import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NotificationsApi } from '@vexto/api-client';
import type { NotificationItem } from '@vexto/models';
import { VxIcon } from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

/**
 * The notification bell, shared by all three apps.
 *
 * One component rather than three, because the endpoint behind it is the same for everybody: every
 * route under `/api/v1/notifications` resolves the recipient from the token, so an operator, a
 * driver and a passenger all read exactly their own. There is no user id to pass and none to get
 * wrong.
 *
 * **Polling, not push.** The count refreshes on a timer while the tab is visible. Browser push is
 * a later milestone with its own service worker, permission prompt and delivery infrastructure;
 * until then a minute-resolution badge is what the product can honestly offer, and pretending
 * otherwise would mean a bell that silently stops updating.
 *
 * The timer stops when the tab is hidden. A phone in a pocket has no reason to wake up for a badge
 * nobody is looking at, and a passenger app is on a metered connection.
 */
@Component({
  selector: 'vx-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="relative">
      <button
        type="button"
        [class]="buttonClass()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <vx-icon name="bell" [size]="18" />

        @if (unread() > 0) {
          <span
            class="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full
                   bg-danger px-1 text-[0.625rem] font-semibold leading-4 text-white"
          >
            {{ unread() > 99 ? '99+' : unread() }}
          </span>
        }
      </button>

      @if (open()) {
        <!-- Click-away layer. A backdrop is simpler and more reliable here than a document
             listener, and it also stops interaction with the page behind the open panel. -->
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default"
          aria-label="Close notifications"
          (click)="open.set(false)"
        ></button>

        <div
          class="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line-subtle
                 bg-surface shadow-lg"
          role="dialog"
          aria-label="Notifications"
        >
          <div class="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
            <p class="font-medium text-ink">Notifications</p>

            @if (unread() > 0) {
              <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="markAllRead()">
                Mark all read
              </button>
            }
          </div>

          @if (loading()) {
            <p class="px-4 py-6 text-center text-body text-ink-muted">Loading…</p>
          } @else if (items().length === 0) {
            <p class="px-4 py-6 text-center text-body text-ink-muted">Nothing to report.</p>
          } @else {
            <ul class="max-h-96 divide-y divide-line-subtle overflow-y-auto vx-scroll">
              @for (item of items(); track item.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-start
                           hover:bg-surface-muted"
                    [class.bg-surface-muted]="item.status === 'Unread'"
                    (click)="markRead(item)"
                  >
                    <span class="flex w-full items-center gap-2">
                      @if (item.status === 'Unread') {
                        <span class="size-1.5 flex-none rounded-full bg-primary"></span>
                      }
                      <span class="flex-1 truncate font-medium text-ink">{{ item.title }}</span>
                    </span>
                    <span class="text-meta text-ink-secondary">{{ item.message }}</span>
                    <span class="text-meta text-ink-muted">{{ relative(item.createdAtUtc) }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
})
export class VxNotificationBell {
  /**
   * Which header this bell is sitting in.
   *
   * The operator portal's toolbar is light and the mobile apps' header is dark, and the ghost
   * button's secondary grey is unreadable on the second. A tone rather than a free-form class
   * input: there are two headers in the product, and a component that accepts arbitrary classes
   * ends up with three different-looking bells.
   */
  readonly tone = input<'default' | 'onDark'>('default');

  /** How often the badge refreshes while the tab is visible. */
  private static readonly PollIntervalMs = 60_000;

  private readonly api = inject(NotificationsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly relative = formatRelative;

  protected readonly buttonClass = computed(() =>
    this.tone() === 'onDark'
      ? 'vx-btn vx-btn-icon relative text-white/85 hover:text-white'
      : 'vx-btn vx-btn-ghost vx-btn-icon relative',
  );

  protected readonly unread = signal(0);
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);

  protected readonly ariaLabel = computed(() =>
    this.unread() === 0 ? 'Notifications' : `Notifications, ${this.unread()} unread`,
  );

  constructor() {
    this.refreshCount();

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.refreshCount();
      }
    }, VxNotificationBell.PollIntervalMs);

    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);

    if (next) {
      this.loadList();
    }
  }

  /**
   * Marking one read is optimistic: the row and the badge update immediately and the request
   * follows. A failed request is not surfaced — the worst case is a badge that is one too low
   * until the next poll corrects it, which is not worth a toast.
   */
  protected markRead(item: NotificationItem): void {
    if (item.status === 'Read') {
      return;
    }

    this.items.update((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, status: 'Read' } : candidate,
      ),
    );

    this.unread.update((count) => Math.max(0, count - 1));

    this.api.markRead(item.id).subscribe({ error: () => this.refreshCount() });
  }

  protected markAllRead(): void {
    this.items.update((current) => current.map((item) => ({ ...item, status: 'Read' })));
    this.unread.set(0);

    this.api.markAllRead().subscribe({ error: () => this.refreshCount() });
  }

  /** The badge only. Its own endpoint, so a count never has to fetch a list. */
  private refreshCount(): void {
    this.api.unreadCount().subscribe({
      next: (result) => this.unread.set(result.unreadCount),

      // A user whose tenant or session cannot answer simply has no badge. Nothing here is
      // important enough to interrupt them over.
      error: () => this.unread.set(0),
    });
  }

  private loadList(): void {
    this.loading.set(true);

    this.api.list({ pageSize: 20 }).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }
}
