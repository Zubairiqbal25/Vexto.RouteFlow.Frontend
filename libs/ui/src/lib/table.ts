import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { VxIcon, type VxIconName } from './icon/vx-icon';

/**
 * Search box plus a slot for feature-specific filters.
 *
 * Search is debounced here rather than in every feature store: typing "moh" must not produce three
 * requests, and getting that wrong in fifteen places is how a list screen becomes slow.
 */
@Component({
  selector: 'vx-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="flex flex-wrap items-center gap-3 border-b border-line-subtle px-5 py-4">
      @if (showSearch()) {
      <div class="relative min-w-0 flex-1 sm:max-w-xs">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
          <vx-icon name="search" [size]="16" />
        </span>
        <input
          type="search"
          class="vx-input pl-9"
          [attr.aria-label]="searchLabel()"
          [placeholder]="searchPlaceholder()"
          [value]="searchValue()"
          (input)="onSearch($event)"
        />
      </div>
      }

      <ng-content select="[filters]" />

      <div class="ms-auto flex items-center gap-2">
        <ng-content select="[trailing]" />
      </div>
    </div>
  `,
})
export class VxFilterBar {
  readonly searchValue = input('');
  /** Some lists have no free-text search on the API; a box that does nothing is worse than none. */
  readonly showSearch = input(true);
  readonly searchPlaceholder = input('Search');
  readonly searchLabel = input('Search');
  readonly searchChange = output<string>();

  private readonly typed = new Subject<string>();

  constructor() {
    this.typed
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((value) => this.searchChange.emit(value));
  }

  protected onSearch(event: Event): void {
    this.typed.next((event.target as HTMLInputElement).value.trim());
  }
}

/** Page-by-page navigation. Deliberately not infinite scroll: dispatchers count and cross-check. */
@Component({
  selector: 'vx-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    @if (totalCount() > 0) {
      <nav
        class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-5 py-3.5"
        aria-label="Pagination"
      >
        <p class="text-meta text-ink-muted">
          Showing <span class="font-medium text-ink-secondary">{{ firstRow() }}–{{ lastRow() }}</span>
          of <span class="font-medium text-ink-secondary">{{ totalCount() }}</span>
        </p>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="vx-btn vx-btn-secondary vx-btn-sm vx-btn-icon"
            [disabled]="page() <= 1"
            aria-label="Previous page"
            (click)="pageChange.emit(page() - 1)"
          >
            <vx-icon name="chevron-left" [size]="16" />
          </button>
          <span class="px-2 text-meta text-ink-secondary">
            Page {{ page() }} of {{ totalPages() }}
          </span>
          <button
            type="button"
            class="vx-btn vx-btn-secondary vx-btn-sm vx-btn-icon"
            [disabled]="page() >= totalPages()"
            aria-label="Next page"
            (click)="pageChange.emit(page() + 1)"
          >
            <vx-icon name="chevron-right" [size]="16" />
          </button>
        </div>
      </nav>
    }
  `,
})
export class VxPagination {
  readonly page = input(1);
  readonly pageSize = input(20);
  readonly totalCount = input(0);
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / Math.max(1, this.pageSize()))),
  );

  protected readonly firstRow = computed(() => (this.page() - 1) * this.pageSize() + 1);

  protected readonly lastRow = computed(() =>
    Math.min(this.totalCount(), this.page() * this.pageSize()),
  );
}

/**
 * The card a list screen lives in: filter bar, then one of four states, then pagination.
 *
 * It owns the *states*, not the columns. Business columns stay in the feature template, because a
 * generic column-definition framework is the thing that always turns into an unmaintainable
 * `any`-typed config object.
 */
@Component({
  selector: 'vx-table-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxPagination],
  template: `
    <section class="vx-card overflow-hidden">
      <ng-content select="[toolbar]" />

      @if (loading()) {
        <ng-content select="[loading]" />
      } @else if (error()) {
        <ng-content select="[error]" />
      } @else if (isEmpty()) {
        <ng-content select="[empty]" />
      } @else {
        <div class="vx-table-scroll vx-scroll">
          <ng-content />
        </div>
        <vx-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          (pageChange)="pageChange.emit($event)"
        />
      }
    </section>
  `,
})
export class VxTableShell {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly isEmpty = input(false);
  readonly page = input(1);
  readonly pageSize = input(20);
  readonly totalCount = input(0);
  readonly pageChange = output<number>();
}

/**
 * The `⋯` menu at the end of a row.
 *
 * Keyboard-accessible by construction: the trigger is a button, the menu is a `menu` role, and
 * Escape closes it. Row actions that are not reachable by keyboard are an accessibility bug that
 * only shows up in an audit.
 */
@Component({
  selector: 'vx-row-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  host: { '(document:click)': 'closeFromOutside($event)', '(keydown.escape)': 'open = false' },
  template: `
    <div class="relative inline-block text-left">
      <button
        type="button"
        class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
        [attr.aria-expanded]="open"
        aria-haspopup="menu"
        [attr.aria-label]="label()"
        (click)="toggle($event)"
      >
        <vx-icon name="more" [size]="18" />
      </button>
      @if (open) {
        <div
          role="menu"
          class="vx-card absolute right-0 z-20 mt-1 min-w-44 py-1 shadow-pop"
        >
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class VxRowActions {
  readonly label = input('Row actions');

  protected open = false;

  private ignoreNextDocumentClick = false;

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.ignoreNextDocumentClick = true;
    this.open = !this.open;
  }

  protected closeFromOutside(_event: Event): void {
    if (this.ignoreNextDocumentClick) {
      this.ignoreNextDocumentClick = false;

      return;
    }

    this.open = false;
  }
}

/** A single item inside `vx-row-actions`. */
@Component({
  selector: 'vx-row-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <button
      type="button"
      role="menuitem"
      class="flex w-full items-center gap-2.5 px-3 py-2 text-start text-body hover:bg-surface-hover"
      [class.text-ink-secondary]="!danger()"
      [style.color]="danger() ? 'var(--vexto-danger-text)' : null"
      [disabled]="disabled()"
      (click)="selected.emit()"
    >
      @if (icon(); as name) {
        <vx-icon [name]="name" [size]="16" />
      }
      <ng-content />
    </button>
  `,
})
export class VxRowAction {
  readonly icon = input<VxIconName | null>(null);
  readonly danger = input(false);
  readonly disabled = input(false);
  readonly selected = output<void>();
}

