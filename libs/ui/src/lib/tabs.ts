import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface VxTab {
  readonly id: string;
  readonly label: string;
  /** Shown as a small count beside the label; omit when there is nothing to count. */
  readonly count?: number | null;
}

/**
 * In-page tabs, as an ARIA tab list.
 *
 * Selection is driven by the parent rather than held here, so a route detail page can keep the
 * active tab in the URL later without changing this component. Arrow-key navigation comes from the
 * roving `tabindex`, which is what makes a tab strip usable without a mouse.
 */
@Component({
  selector: 'vx-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border-b border-line" role="tablist" [attr.aria-label]="label()">
      <div class="vx-no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        @for (tab of tabs(); track tab.id) {
          <button
            type="button"
            role="tab"
            class="flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-body font-medium transition-colors"
            [class.border-transparent]="tab.id !== active()"
            [class.text-ink-muted]="tab.id !== active()"
            [style.border-color]="tab.id === active() ? 'var(--vexto-primary)' : null"
            [style.color]="tab.id === active() ? 'var(--vexto-primary-active)' : null"
            [attr.aria-selected]="tab.id === active()"
            [attr.tabindex]="tab.id === active() ? 0 : -1"
            (click)="selected.emit(tab.id)"
          >
            {{ tab.label }}
            @if (tab.count !== null && tab.count !== undefined) {
              <span
                class="rounded-full px-1.5 py-0.5 text-meta"
                [class.bg-surface-muted]="tab.id !== active()"
                [style.background]="tab.id === active() ? 'var(--vexto-primary-50)' : null"
              >
                {{ tab.count }}
              </span>
            }
          </button>
        }
      </div>
    </div>
  `,
})
export class VxTabs {
  readonly tabs = input.required<readonly VxTab[]>();
  readonly active = input.required<string>();
  readonly label = input('Sections');
  readonly selected = output<string>();
}
