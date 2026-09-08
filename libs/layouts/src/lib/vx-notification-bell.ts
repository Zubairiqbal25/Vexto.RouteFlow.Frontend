import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NotificationsApi } from '@vexto/api-client';
import type { NotificationItem } from '@vexto/models';
import {
  VxDrawer,
  type VxFilterChip,
  VxFilterChips,
  VxIcon,
  type VxIconName,
  VxSkeleton,
} from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

/** The three things Vexto notifies about, derived from the backend's own type names. */
type NotificationCategory = 'trips' | 'payments' | 'system';

/**
 * Which category a notification type belongs to.
 *
 * Derived from the type name rather than stored: the backend has eleven types and they group
 * naturally into what is happening to your journey, what is happening to your money, and
 * everything else. A stored category would be a twelfth thing to keep in step.
 */
function categoryOf(type: string): NotificationCategory {
  if (type.startsWith('Trip') || type.startsWith('Bus') || type.startsWith('Driver')) {
    return 'trips';
  }

  if (type.startsWith('Invoice') || type.startsWith('Payment')) {
    return 'payments';
  }

  return 'system';
}

const ICONS: Readonly<Record<string, VxIconName>> = {
  BusApproachingPickup: 'live',
  TripStarted: 'play',
  TripCancelled: 'ban',
  DriverOrVehicleChanged: 'switch',
  PassengerAbsenceCreated: 'calendar',
  PassengerAbsenceCancelled: 'calendar',
  PassengerBoarded: 'check-circle',
  InvoiceCreated: 'agreements',
  PaymentSucceeded: 'check-circle',
  PaymentFailed: 'alert',
  InvoiceOverdue: 'clock',
};

const TONES: Readonly<Record<string, string>> = {
  TripCancelled: 'danger',
  PaymentFailed: 'danger',
  InvoiceOverdue: 'warning',
  BusApproachingPickup: 'info',
  PaymentSucceeded: 'success',
  PassengerBoarded: 'success',
};

/**
 * The notification centre, shared by all three apps.
 *
 * One component rather than three, because the endpoint behind it is the same for everybody: every
 * route under `/api/v1/notifications` resolves the recipient from the token, so an operator, a
 * driver and a passenger all read exactly their own. There is no user id to pass and none to get
 * wrong.
 *
 * **A drawer, not a popover.** A 320px dropdown could hold five items before it needed its own
 * scrollbar, which is the wrong shape for something people open to catch up. `VxDrawer` also gives
 * it Escape, a focus trap and a bottom-sheet layout on a phone for free.
 *
 * **Categories come from the type names**, so the filter is honest: Trips, Payments and System are
 * the three things the backend actually notifies about, not aspirational buckets.
 *
 * **Polling, not push.** The count refreshes on a timer while the tab is visible. Browser push is a
 * separate milestone with its own service worker and permission prompt; until then a
 * minute-resolution badge is what the product can honestly offer, and pretending otherwise would
 * mean a bell that silently stops updating. The timer stops when the tab is hidden — a phone in a
 * pocket has no reason to wake up for a badge nobody is looking at.
 */
@Component({
  selector: 'vx-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxDrawer, VxFilterChips, VxIcon, VxSkeleton],
  template: `
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
                 bg-danger px-1 text-[0.625rem] font-semibold leading-4"
          style="color: var(--vexto-on-status)"
        >
          {{ unread() > 99 ? '99+' : unread() }}
        </span>
      }
    </button>

    <vx-drawer
      [open]="open()"
      title="Notifications"
      [subtitle]="subtitle()"
      (closed)="open.set(false)"
    >
      <div class="flex flex-col gap-4">
        @if (categoryChips().length > 1) {
          <vx-filter-chips
            label="Notification type"
            [chips]="categoryChips()"
            [active]="activeCategories()"
            (toggled)="toggleCategory($event)"
            (cleared)="activeCategories.set([])"
          />
        }

        @if (loading()) {
          <div class="flex flex-col gap-3">
            @for (row of [0, 1, 2, 3]; track row) {
              <vx-skeleton height="4rem" />
            }
          </div>
        } @else if (items().length === 0) {
          <div class="py-10 text-center">
            <span
              class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full"
              style="background: var(--vexto-surface-sunken); color: var(--vexto-text-muted)"
            >
              <vx-icon name="bell" [size]="22" />
            </span>
            <p class="text-body font-medium text-ink">Nothing to report</p>
            <p class="mt-1 text-meta text-ink-muted">
              Trip and payment updates will appear here.
            </p>
          </div>
        } @else if (visible().length === 0) {
          <p class="py-10 text-center text-body text-ink-muted">
            Nothing in that category.
          </p>
        } @else {
          <ul class="flex flex-col gap-1">
            @for (item of visible(); track item.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-start gap-3 rounded-xl p-3 text-start transition-colors
                         hover:bg-surface-hover"
                  [style.background]="
                    item.status === 'Unread' ? 'var(--vexto-surface-muted)' : null
                  "
                  (click)="activate(item)"
                >
                  <span
                    class="flex size-9 flex-none items-center justify-center rounded-lg"
                    [style.background]="'var(--vexto-' + toneOf(item) + '-soft)'"
                    [style.color]="'var(--vexto-' + toneOf(item) + '-text)'"
                  >
                    <vx-icon [name]="iconOf(item)" [size]="17" />
                  </span>

                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2">
                      <span class="flex-1 truncate text-body font-medium text-ink">
                        {{ item.title }}
                      </span>
                      @if (item.status === 'Unread') {
                        <span
                          class="size-2 flex-none rounded-full"
                          style="background: var(--vexto-primary)"
                          aria-label="Unread"
                        ></span>
                      }
                    </span>
                    <span class="mt-0.5 block text-meta text-ink-secondary">{{ item.message }}</span>
                    <span class="mt-1 block text-meta text-ink-muted">
                      {{ relative(item.createdAtUtc) }}
                      @if (linkFor(item)) {
                        · Opens {{ linkLabel(item) }}
                      }
                    </span>
                  </span>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <div footer class="flex gap-2">
        <button type="button" class="vx-btn vx-btn-secondary flex-1" (click)="open.set(false)">
          Close
        </button>
        <button
          type="button"
          class="vx-btn vx-btn-primary flex-1"
          [disabled]="unread() === 0"
          (click)="markAllRead()"
        >
          Mark all read
        </button>
      </div>
    </vx-drawer>
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
  private readonly router = inject(Router);
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
  protected readonly activeCategories = signal<readonly string[]>([]);

  protected readonly ariaLabel = computed(() =>
    this.unread() === 0 ? 'Notifications' : `Notifications, ${this.unread()} unread`,
  );

  protected readonly subtitle = computed(() =>
    this.unread() === 0 ? 'You are all caught up' : `${this.unread()} unread`,
  );

  protected readonly categoryChips = computed<VxFilterChip[]>(() => {
    const counts = new Map<NotificationCategory, number>();

    for (const item of this.items()) {
      const category = categoryOf(item.type);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    const labels: Record<NotificationCategory, string> = {
      trips: 'Trips',
      payments: 'Payments',
      system: 'System',
    };

    return (['trips', 'payments', 'system'] as const)
      .filter((category) => counts.has(category))
      .map((category) => ({
        id: category,
        label: labels[category],
        count: counts.get(category) ?? 0,
      }));
  });

  protected readonly visible = computed(() => {
    const active = this.activeCategories();

    return active.length === 0
      ? this.items()
      : this.items().filter((item) => active.includes(categoryOf(item.type)));
  });

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

  protected toggleCategory(id: string): void {
    this.activeCategories.update((active) =>
      active.includes(id) ? active.filter((value) => value !== id) : [...active, id],
    );
  }

  protected iconOf(item: NotificationItem): VxIconName {
    return ICONS[item.type] ?? 'info';
  }

  protected toneOf(item: NotificationItem): string {
    return TONES[item.type] ?? 'neutral';
  }

  /**
   * Where this notification goes, or null.
   *
   * **Null is a real answer.** A notification whose payload carries no id has nowhere honest to go,
   * and a link to a list page pretending to be a deep link is worse than no link — the user follows
   * it, does not find the thing, and stops trusting the next one. Only `tripId` and `invoiceId` are
   * published today, so only those two navigate.
   */
  protected linkFor(item: NotificationItem): string | null {
    const data = this.dataOf(item);

    if (typeof data['tripId'] === 'string') {
      return `/trips/${data['tripId']}`;
    }

    if (typeof data['invoiceId'] === 'string') {
      return `/billing/invoices/${data['invoiceId']}`;
    }

    return null;
  }

  protected linkLabel(item: NotificationItem): string {
    return this.linkFor(item)?.startsWith('/trips') ? 'the trip' : 'the invoice';
  }

  /**
   * Marks read, and follows the link when there is one.
   *
   * Marking is optimistic: the row and the badge update immediately and the request follows. A
   * failed request is not surfaced — the worst case is a badge one too low until the next poll
   * corrects it, which is not worth interrupting somebody over.
   */
  protected activate(item: NotificationItem): void {
    this.markRead(item);

    const link = this.linkFor(item);

    if (link) {
      this.open.set(false);
      void this.router.navigateByUrl(link);
    }
  }

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

    this.api.list({ pageSize: 30 }).subscribe({
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

  /** The payload, or an empty object. Malformed JSON must not break the panel. */
  private dataOf(item: NotificationItem): Record<string, unknown> {
    if (!item.dataJson) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(item.dataJson);

      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
