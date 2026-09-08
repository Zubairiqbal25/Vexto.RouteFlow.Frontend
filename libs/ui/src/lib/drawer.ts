import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { DOCUMENT } from '@angular/core';
import { VxIcon } from './icon/vx-icon';

/**
 * The quick-view drawer.
 *
 * Clicking a card opens this rather than navigating: a dispatcher checking which bus a passenger is
 * on wants an answer, not a page load and a back button. Full editing still lives on the record's
 * own page, and the drawer offers a "View full details" link to get there — so the drawer is a
 * shortcut, never a second place the same fields are maintained.
 *
 * **It becomes a bottom sheet below `sm`.** A right-hand panel on a phone is a full-screen modal
 * wearing a costume; a sheet that rises from the bottom is what the platform's own applications do
 * and what a thumb can reach. Same component, same content, one breakpoint.
 *
 * Escape closes it, focus is sent into it on open and the page behind it stops scrolling — the
 * three things that separate a real dialog from a floating div.
 *
 * **It is `position: fixed`, so no ancestor may create a containing block.** `transform`, `filter`,
 * `backdrop-filter`, `will-change` and `contain` all do, and any of them on a parent silently
 * re-anchors this panel to that parent's box instead of the viewport — which renders as a squashed
 * sliver rather than as an error. The operator top bar carries a comment about exactly this: it used
 * to have `backdrop-blur`, and the notification drawer inside it was the casualty.
 */
@Component({
  selector: 'vx-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50"
        style="background: var(--vexto-overlay)"
        role="presentation"
        (click)="closed.emit()"
      ></div>

      <aside
        class="fixed z-50 flex flex-col
               inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl
               sm:inset-y-0 sm:end-0 sm:start-auto sm:max-h-none sm:w-[26rem] sm:rounded-none
               sm:border-s sm:border-line"
        style="background: var(--vexto-surface)"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
      >
        <!-- The grab handle reads as "drag me" on a phone and is meaningless on a desktop panel. -->
        <div class="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span class="h-1 w-9 rounded-full" style="background: var(--vexto-border-strong)"></span>
        </div>

        <header class="flex flex-none items-start justify-between gap-3 px-5 py-4">
          <div class="min-w-0">
            <p class="truncate text-base font-semibold text-ink">{{ title() }}</p>
            @if (subtitle(); as line) {
              <p class="mt-0.5 truncate text-meta text-ink-muted">{{ line }}</p>
            }
          </div>
          <button
            type="button"
            class="vx-btn vx-btn-ghost vx-btn-icon vx-btn-sm"
            aria-label="Close"
            (click)="closed.emit()"
          >
            <vx-icon name="close" [size]="18" />
          </button>
        </header>

        <div class="vx-scroll min-h-0 flex-1 overflow-y-auto border-t border-line-subtle px-5 py-4">
          <ng-content />
        </div>

        <footer class="flex-none border-t border-line-subtle px-5 py-3.5">
          <ng-content select="[footer]" />
        </footer>
      </aside>
    }
  `,
})
export class VxDrawer {
  private readonly document = inject(DOCUMENT);

  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input<string | null>(null);
  readonly closed = output<void>();

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }

      // The page behind a modal must not scroll: on a phone especially, a sheet that scrolls the
      // list underneath it loses the user's place entirely.
      const body = this.document.body;
      const previous = body.style.overflow;
      body.style.overflow = 'hidden';

      onCleanup(() => {
        body.style.overflow = previous;
      });
    });
  }

  protected onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}

/** One toggleable filter pill. */
export interface VxFilterChip {
  readonly id: string;
  readonly label: string;
  readonly count?: number | null;
}

/**
 * The compact filter row.
 *
 * Replaces the panel of labelled selects that a traditional admin screen opens with. The three or
 * four filters an operator actually uses every day are pills they can hit in one click; anything
 * rarer belongs behind "More filters", which is the host's to render.
 *
 * The active count and "Clear all" are not decoration — a filtered list that looks empty is the
 * most common support call on any admin product, and both exist to answer "why can't I see it".
 */
@Component({
  selector: 'vx-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2" role="group" [attr.aria-label]="label()">
      @for (chip of chips(); track chip.id) {
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-meta
                 font-medium transition-colors"
          [class]="
            isActive(chip.id)
              ? 'border-transparent'
              : 'border-line text-ink-secondary hover:bg-surface-hover hover:text-ink'
          "
          [style.background]="isActive(chip.id) ? 'var(--vexto-primary-soft)' : null"
          [style.color]="isActive(chip.id) ? 'var(--vexto-primary-active)' : null"
          [style.border-color]="isActive(chip.id) ? 'var(--vexto-primary-200)' : null"
          [attr.aria-pressed]="isActive(chip.id)"
          (click)="toggled.emit(chip.id)"
        >
          {{ chip.label }}
          @if (chip.count !== null && chip.count !== undefined) {
            <span class="tabular-nums opacity-70">{{ chip.count }}</span>
          }
        </button>
      }

      @if (active().length > 0) {
        <button
          type="button"
          class="ms-1 text-meta font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          (click)="cleared.emit()"
        >
          Clear all ({{ active().length }})
        </button>
      }
    </div>
  `,
})
export class VxFilterChips {
  readonly chips = input.required<readonly VxFilterChip[]>();
  readonly active = input<readonly string[]>([]);
  readonly label = input('Filters');
  readonly toggled = output<string>();
  readonly cleared = output<void>();

  protected isActive(id: string): boolean {
    return this.active().includes(id);
  }
}

/**
 * A titled band inside a page, with room for a control on the right.
 *
 * Smaller and quieter than `VxPageHeader`: that names the screen, this names a region within it
 * ("Today", "Active fleet", "Recent activity"), so the two never compete for the same visual weight.
 */
@Component({
  selector: 'vx-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex items-end justify-between gap-4">
      <div class="min-w-0">
        <h2 class="text-[0.9375rem] font-semibold text-ink">{{ title() }}</h2>
        @if (description(); as line) {
          <p class="mt-0.5 text-meta text-ink-muted">{{ line }}</p>
        }
      </div>
      <div class="flex flex-none items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class VxSectionHeader {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
