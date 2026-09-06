import { DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VextoApiError } from '@vexto/api-client';
import type { PagedResult } from '@vexto/models';
import { type Observable, Subject, catchError, of, switchMap } from 'rxjs';

/**
 * The state behind every operator list screen: filters, a page, four display states.
 *
 * Six screens need exactly this, and writing it six times is how they drift apart — one forgets to
 * reset to page 1 when a filter changes, another leaves the spinner up after an error. It stays a
 * small class rather than becoming a table framework: it knows about paging and loading, and
 * nothing at all about columns.
 *
 * Requests are `switchMap`ped, so a fast typist's earlier response cannot arrive last and overwrite
 * the newer one.
 */
export class PagedList<TItem, TFilters extends Record<string, unknown>> {
  private readonly requests = new Subject<void>();

  private readonly _items = signal<TItem[]>([]);
  private readonly _total = signal(0);
  private readonly _page = signal(1);
  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly total = this._total.asReadonly();
  readonly page = this._page.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isEmpty = computed(() => !this._loading() && !this._error() && this._items().length === 0);

  /** True when filters are narrowing the list, so the empty state can say so. */
  readonly isFiltered = computed(() =>
    Object.values(this.filters()).some((value) => value !== null && value !== undefined && value !== ''),
  );

  readonly filters = signal<TFilters>({} as TFilters);

  constructor(
    private readonly fetch: (
      filters: TFilters,
      page: number,
      pageSize: number,
    ) => Observable<PagedResult<TItem>>,
    initialFilters: TFilters,
    readonly pageSize = 20,
  ) {
    this.filters.set(initialFilters);

    this.requests
      .pipe(
        // The error is caught inside the inner observable: letting it reach the outer stream would
        // terminate the subscription, and the list would never load again without a page reload.
        switchMap(() =>
          this.fetch(this.filters(), this._page(), this.pageSize).pipe(
            catchError((error: unknown) => of(error instanceof Error ? error : new Error(String(error)))),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((result) => {
        this._loading.set(false);

        if (result instanceof Error) {
          this._error.set(
            result instanceof VextoApiError ? result.message : 'We could not load this list.',
          );

          return;
        }

        this._items.set(result.items);
        this._total.set(result.totalCount);
      });

    this.reload();
  }

  /** Applies a filter change and returns to page 1 — page 4 of a different filter is meaningless. */
  setFilter(patch: Partial<TFilters>): void {
    this.filters.update((current) => ({ ...current, ...patch }));
    this._page.set(1);
    this.reload();
  }

  setPage(page: number): void {
    this._page.set(Math.max(1, page));
    this.reload();
  }

  reload(): void {
    this._loading.set(true);
    this._error.set(null);
    this.requests.next();
  }

  /** Reloads without the skeleton, for a refresh after an inline action succeeded. */
  refreshQuietly(): void {
    this._error.set(null);
    this.requests.next();
  }
}
