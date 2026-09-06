import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { VxIcon, type VxIconName } from './icon/vx-icon';

/**
 * What a list shows when there is genuinely nothing in it.
 *
 * An empty table with headers and no rows looks broken. This says what the screen is for and offers
 * the one action that fixes it.
 */
@Component({
  selector: 'vx-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span
        class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted"
      >
        <vx-icon [name]="icon()" [size]="26" />
      </span>
      <h3 class="text-base font-semibold text-ink">{{ title() }}</h3>
      @if (description(); as text) {
        <p class="mt-1.5 max-w-sm text-body text-ink-muted">{{ text }}</p>
      }
      @if (actionLabel(); as label) {
        <button type="button" class="vx-btn vx-btn-primary mt-6" (click)="action.emit()">
          <vx-icon name="plus" [size]="16" />
          {{ label }}
        </button>
      }
    </div>
  `,
})
export class VxEmptyState {
  readonly icon = input<VxIconName>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}

/**
 * What a list shows when the request failed.
 *
 * Distinct from the empty state on purpose — "no passengers yet" and "we could not load passengers"
 * are different situations, and only one of them is fixed by retrying.
 */
@Component({
  selector: 'vx-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="flex flex-col items-center justify-center px-6 py-16 text-center" role="alert">
      <span
        class="mb-4 flex size-14 items-center justify-center rounded-2xl"
        style="background: var(--vexto-danger-soft); color: var(--vexto-danger)"
      >
        <vx-icon name="alert" [size]="26" />
      </span>
      <h3 class="text-base font-semibold text-ink">{{ title() }}</h3>
      <p class="mt-1.5 max-w-md text-body text-ink-muted">{{ message() }}</p>
      @if (canRetry()) {
        <button type="button" class="vx-btn vx-btn-secondary mt-6" (click)="retry.emit()">
          <vx-icon name="refresh" [size]="16" />
          Try again
        </button>
      }
    </div>
  `,
})
export class VxErrorState {
  readonly title = input('Something went wrong');
  readonly message = input.required<string>();
  readonly canRetry = input(true);
  readonly retry = output<void>();
}

/**
 * The loading placeholder for a table.
 *
 * Skeleton rows in the real column count keep the page from jumping when data arrives, which a
 * centred spinner cannot do.
 */
@Component({
  selector: 'vx-skeleton-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="divide-y divide-line-subtle" aria-busy="true" aria-live="polite">
      <span class="sr-only">Loading</span>
      @for (row of rowRange(); track row) {
        <div class="flex items-center gap-4 px-5 py-4">
          @for (column of columnRange(); track column) {
            <div
              class="vx-skeleton h-3.5"
              [style.flex]="column === 0 ? '2 1 0%' : '1 1 0%'"
            ></div>
          }
        </div>
      }
    </div>
  `,
})
export class VxSkeletonTable {
  readonly rows = input(6);
  readonly columns = input(5);

  protected rowRange(): number[] {
    return Array.from({ length: this.rows() }, (_, index) => index);
  }

  protected columnRange(): number[] {
    return Array.from({ length: this.columns() }, (_, index) => index);
  }
}

/** A plain shimmer block, for card and detail-header placeholders. */
@Component({
  selector: 'vx-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="vx-skeleton block" [style.width]="width()" [style.height]="height()"></span>`,
})
export class VxSkeleton {
  readonly width = input('100%');
  readonly height = input('0.875rem');
}
