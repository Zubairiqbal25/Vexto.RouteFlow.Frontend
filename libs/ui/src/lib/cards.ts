import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { VxIcon, type VxIconName } from './icon/vx-icon';

/**
 * The responsive grid every card list sits in.
 *
 * One place to change the breakpoints, so a passenger grid and a route grid never drift apart. The
 * column counts come from what a card of this width can legibly hold, not from a round number, and
 * they are measured against the *content* area rather than the window — the rail takes 268px and the
 * page is capped at 1600, so a 1440 display has about 1150px to work with and comfortably holds
 * three cards of the default width.
 */
@Component({
  selector: 'vx-card-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid gap-4"
      [class]="
        dense()
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
      "
    >
      <ng-content />
    </div>
  `,
})
export class VxCardGrid {
  /** Denser packing for cards that carry less. Vehicles and routes; not passengers. */
  readonly dense = input(false);
}

/**
 * One action in a card's overflow menu.
 *
 * `danger` is a presentation flag, not a permission: it colours the item and nothing more. The
 * caller is still responsible for confirming anything destructive.
 */
export interface VxCardAction {
  readonly label: string;
  readonly icon?: VxIconName;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Anything the host wants back in `(selected)`. */
  readonly id: string;
}

/**
 * The `⋯` menu on a card.
 *
 * Cards carry one visible primary action and put the rest here. Six buttons on every card in a grid
 * of forty is four hundred controls on one screen, and the one that matters stops standing out.
 */
@Component({
  selector: 'vx-quick-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  host: { '(document:click)': 'closeIfOutside($event)', class: 'relative inline-flex' },
  template: `
    <button
      type="button"
      class="vx-btn vx-btn-ghost vx-btn-icon vx-btn-sm"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      aria-haspopup="menu"
      (click)="toggle($event)"
    >
      <vx-icon name="more" [size]="18" [strokeWidth]="2.5" />
    </button>

    @if (open()) {
      <div
        role="menu"
        class="vx-card absolute end-0 top-full z-40 mt-1 w-52 py-1 shadow-pop"
        style="background: var(--vexto-surface-raised)"
      >
        @for (action of actions(); track action.id) {
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-body
                   hover:bg-surface-hover disabled:opacity-50"
            [class.text-ink-secondary]="!action.danger"
            [style.color]="action.danger ? 'var(--vexto-danger-text)' : null"
            [disabled]="action.disabled"
            (click)="choose(action)"
          >
            @if (action.icon; as icon) {
              <vx-icon [name]="icon" [size]="16" />
            }
            {{ action.label }}
          </button>
        }
      </div>
    }
  `,
})
export class VxQuickActions {
  readonly actions = input.required<readonly VxCardAction[]>();
  readonly label = input('More actions');
  readonly selected = output<string>();

  protected readonly open = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update((value) => !value);
  }

  /**
   * Closes on a click anywhere outside this menu.
   *
   * Containment rather than stopping propagation inside the panel: a div that swallows clicks needs
   * a click handler, and a click handler on a non-interactive element is an accessibility failure
   * the linter is right to reject.
   */
  protected closeIfOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected choose(action: VxCardAction): void {
    this.open.set(false);
    this.selected.emit(action.id);
  }
}

/**
 * A labelled fact inside a card.
 *
 * The label is small and muted, the value is the readable thing. Used for the two-to-four operational
 * facts a card leads with — a pickup, an ETA, a capacity — so they line up across every card type
 * without each feature inventing its own spacing.
 */
@Component({
  selector: 'vx-card-fact',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-w-0">
      <p class="vx-section-label">{{ label() }}</p>
      <p class="mt-0.5 truncate text-body font-medium text-ink" [attr.title]="value()">
        {{ value() || '—' }}
      </p>
    </div>
  `,
})
export class VxCardFact {
  readonly label = input.required<string>();
  readonly value = input<string | number | null | undefined>(null);
}

/**
 * The shell every entity card is built from.
 *
 * **Deliberately not a card that renders a business object.** It owns the frame, the hover and
 * focus treatment, the header row and the footer row; what goes inside is projected by the feature,
 * because a passenger card and a route card lead with genuinely different things and forcing both
 * through one configuration object produces a component with thirty inputs that nobody can read.
 *
 * Three content slots: `[media]` for an avatar or icon, the default slot for the body, and
 * `[actions]` for the footer. The header — title, subtitle, status, overflow — is inputs, because
 * that part *is* the same everywhere.
 *
 * The whole card is clickable when `(opened)` is bound, and is then a real button for the keyboard:
 * `tabindex`, Enter and Space. A card that only responds to a mouse is a card half the users cannot
 * use.
 */
@Component({
  selector: 'vx-entity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxQuickActions],
  host: {
    '[class]': 'hostClass()',
    '[attr.role]': '"button"',
    '[attr.tabindex]': '0',
    '[attr.aria-label]': 'title()',
    '(click)': 'activate($event)',
    '(keydown.enter)': 'activate($event)',
    '(keydown.space)': 'activate($event)',
  },
  template: `
    <div class="flex items-start gap-3 p-4 sm:p-5">
      <ng-content select="[media]" />

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-[0.9375rem] font-semibold text-ink" [attr.title]="title()">
              {{ title() }}
            </p>
            @if (subtitle(); as line) {
              <p class="mt-0.5 truncate text-meta text-ink-muted" [attr.title]="line">{{ line }}</p>
            }
          </div>

          <div class="flex flex-none items-center gap-1">
            <ng-content select="[status]" />
            @if (actions().length > 0) {
              <vx-quick-actions [actions]="actions()" (selected)="action.emit($event)" />
            }
          </div>
        </div>

        <ng-content />
      </div>
    </div>

    <ng-content select="[footer]" />
  `,
})
export class VxEntityCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly actions = input<readonly VxCardAction[]>([]);

  /** Renders the card as chosen — a list selection, or the row a drawer is showing. */
  readonly selected = input(false);

  /** Dims the card and marks it as not currently usable. Never used for a blocked passenger. */
  readonly muted = input(false);

  readonly opened = output<void>();
  readonly action = output<string>();

  protected readonly hostClass = computed(() => {
    const base =
      'vx-card group relative block overflow-hidden text-start transition-[box-shadow,border-color,transform]';

    return [
      base,
      'hover:shadow-raised hover:-translate-y-px',
      'focus-visible:outline-2 focus-visible:outline-offset-2',
      this.selected() ? 'vx-card-selected' : '',
      this.muted() ? 'opacity-60' : '',
    ]
      .filter(Boolean)
      .join(' ');
  });

  /**
   * Opens the card, unless the event came from a control inside it.
   *
   * A card that is itself a button still contains buttons — the overflow menu, a primary action —
   * and a click on one of those is that control's alone. Without this check, pressing "Suspend"
   * would also navigate to the record.
   */
  protected activate(event: Event): void {
    const target = event.target as HTMLElement | null;

    if (target?.closest('button, a, input, select, [role="menu"]')) {
      return;
    }

    event.preventDefault();
    this.opened.emit();
  }
}

/**
 * A metric tile, optionally with a trend and a sparkline.
 *
 * The number is the loudest thing on the tile. Everything else — the label above, the delta and the
 * spark below — is context, and a tile that is still loading shows a shimmer rather than a zero,
 * because a zero that later becomes 412 reads as a bug rather than as loading.
 *
 * `delta` is only ever shown when the caller has a real comparison to make. There is no default and
 * no computed-from-nothing percentage: an invented trend on a dashboard is worse than no trend.
 */
@Component({
  selector: 'vx-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="vx-card flex h-full flex-col justify-between gap-4 p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="vx-section-label">{{ label() }}</p>

          @if (loading()) {
            <div class="vx-skeleton mt-2.5 h-8 w-20"></div>
          } @else {
            <p class="mt-1.5 text-[1.75rem] font-semibold leading-9 tracking-tight text-ink">
              {{ value() }}
            </p>
          }

          @if (!loading() && context(); as line) {
            <p class="mt-0.5 truncate text-meta text-ink-muted">{{ line }}</p>
          }
        </div>

        @if (icon(); as name) {
          <span
            class="flex size-10 flex-none items-center justify-center rounded-xl"
            [style.background]="'var(--vexto-' + accent() + '-soft)'"
            [style.color]="'var(--vexto-' + accent() + '-text, var(--vexto-' + accent() + '))'"
          >
            <vx-icon [name]="name" [size]="20" />
          </span>
        }
      </div>

      @if (!loading() && (delta() !== null || spark().length > 1)) {
        <div class="flex items-end justify-between gap-3">
          @if (delta(); as change) {
            <span
              class="inline-flex items-center gap-1 text-meta font-medium"
              [style.color]="
                change.direction === 'flat'
                  ? 'var(--vexto-text-muted)'
                  : change.good
                    ? 'var(--vexto-success-text)'
                    : 'var(--vexto-danger-text)'
              "
            >
              @if (change.direction !== 'flat') {
                <vx-icon
                  [name]="change.direction === 'up' ? 'trend-up' : 'trend-down'"
                  [size]="14"
                  [strokeWidth]="2.25"
                />
              }
              {{ change.label }}
            </span>
          } @else {
            <span></span>
          }

          @if (spark().length > 1) {
            <svg
              class="h-8 w-24 flex-none overflow-visible"
              [attr.viewBox]="'0 0 100 32'"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                [attr.points]="sparkPoints()"
                fill="none"
                [attr.stroke]="'var(--vexto-' + accent() + ')'"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          }
        </div>
      }
    </div>
  `,
})
export class VxMetricCard {
  readonly label = input.required<string>();
  readonly value = input<string | number>('—');
  readonly context = input<string | null>(null);
  readonly icon = input<VxIconName | null>(null);
  readonly accent = input<'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'>(
    'primary',
  );
  readonly loading = input(false);

  /**
   * A real, measured change. `good` says whether the direction is welcome — more no-shows is an
   * increase and bad news, so direction and sentiment are separate.
   */
  readonly delta = input<{
    readonly label: string;
    readonly direction: 'up' | 'down' | 'flat';
    readonly good: boolean;
  } | null>(null);

  /** Values oldest-first. Fewer than two points draws nothing rather than a misleading flat line. */
  readonly spark = input<readonly number[]>([]);

  protected readonly sparkPoints = computed(() => {
    const values = this.spark();

    if (values.length < 2) {
      return '';
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    // A flat series sits on the mid-line rather than on the floor: a run of identical values is
    // "steady", and drawing it along the bottom edge reads as zero.
    const range = max - min || 1;
    const step = 100 / (values.length - 1);

    return values
      .map((value, index) => {
        const x = index * step;
        const y = max === min ? 16 : 30 - ((value - min) / range) * 28;

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });
}

/**
 * A card-shaped skeleton.
 *
 * Matches the real card's height and internal rhythm closely enough that the grid does not jump
 * when the data lands. A spinner in the middle of an empty page tells the user nothing about what
 * is coming; this tells them "four cards, about this big".
 */
@Component({
  selector: 'vx-skeleton-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (card of placeholders(); track card) {
      <div class="vx-card p-4 sm:p-5" aria-hidden="true">
        <div class="flex items-start gap-3">
          @if (media()) {
            <div class="vx-skeleton size-10 flex-none rounded-full"></div>
          }
          <div class="min-w-0 flex-1">
            <div class="vx-skeleton h-4 w-2/5"></div>
            <div class="vx-skeleton mt-2 h-3 w-3/5"></div>
            <div class="mt-4 grid grid-cols-2 gap-3">
              <div class="vx-skeleton h-8"></div>
              <div class="vx-skeleton h-8"></div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class VxSkeletonCard {
  readonly count = input(6);
  readonly media = input(true);

  protected readonly placeholders = computed(() =>
    Array.from({ length: this.count() }, (_, index) => index),
  );
}

/** The two layouts a list can be shown in. Cards lead; the table is for dense comparison. */
export type VxListView = 'cards' | 'table';

/**
 * The Cards / Table switch.
 *
 * Both layouts exist because they answer different questions. Cards are for recognising a person or
 * a vehicle and acting on it, which is most of an operator's day. A table is for comparing forty
 * rows on one column, which is what a finance clerk or a power user actually needs. Offering only
 * one of them makes somebody's job harder.
 */
@Component({
  selector: 'vx-view-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div
      class="inline-flex rounded-lg border border-line p-0.5"
      style="background: var(--vexto-surface-muted)"
      role="group"
      aria-label="List layout"
    >
      @for (option of options; track option.value) {
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-meta font-medium
                 transition-colors"
          [class]="
            view() === option.value
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-muted hover:text-ink-secondary'
          "
          [attr.aria-pressed]="view() === option.value"
          [attr.title]="option.label + ' view'"
          (click)="viewChange.emit(option.value)"
        >
          <vx-icon [name]="option.icon" [size]="15" />
          <span class="hidden sm:inline">{{ option.label }}</span>
        </button>
      }
    </div>
  `,
})
export class VxViewSwitcher {
  readonly view = input.required<VxListView>();
  readonly viewChange = output<VxListView>();

  protected readonly options = [
    { value: 'cards' as const, label: 'Cards', icon: 'grid' as const },
    { value: 'table' as const, label: 'Table', icon: 'list' as const },
  ];
}

/**
 * One entry in an activity feed.
 *
 * Feeds show what the backend actually recorded and nothing else. Vexto has no general event store,
 * so a screen with no real history shows an empty state saying so — inventing plausible-looking
 * past events would be fabricating a record somebody might rely on.
 */
@Component({
  selector: 'vx-activity-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <li class="relative flex gap-3 pb-5 last:pb-0">
      <!-- The connecting rail. Hidden on the last item so the timeline ends rather than trailing off. -->
      @if (!last()) {
        <span
          class="absolute start-[0.9375rem] top-8 bottom-0 w-px"
          style="background: var(--vexto-border)"
          aria-hidden="true"
        ></span>
      }

      <span
        class="relative z-10 flex size-8 flex-none items-center justify-center rounded-full"
        [style.background]="'var(--vexto-' + tone() + '-soft)'"
        [style.color]="'var(--vexto-' + tone() + '-text, var(--vexto-' + tone() + '))'"
      >
        <vx-icon [name]="icon()" [size]="16" />
      </span>

      <div class="min-w-0 flex-1 pt-1">
        <p class="text-body text-ink">
          <span class="font-medium">{{ title() }}</span>
          @if (detail(); as line) {
            <span class="text-ink-secondary"> — {{ line }}</span>
          }
        </p>
        @if (timestamp(); as when) {
          <p class="mt-0.5 text-meta text-ink-muted">{{ when }}</p>
        }
      </div>
    </li>
  `,
})
export class VxActivityItem {
  readonly title = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly timestamp = input<string | null>(null);
  readonly icon = input<VxIconName>('info');
  readonly tone = input<'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'>(
    'neutral',
  );
  readonly last = input(false);
}
