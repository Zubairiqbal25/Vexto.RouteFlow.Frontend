import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VextoApiError } from '@vexto/api-client';
import type { PagedResult } from '@vexto/models';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { PagedList } from './paged-list';

interface Filters extends Record<string, unknown> {
  search: string;
}

function page(items: string[], totalCount = items.length): PagedResult<string> {
  return { items, pageNumber: 1, pageSize: 20, totalCount };
}

describe('PagedList', () => {
  let injector: Injector;

  beforeEach(() => {
    injector = TestBed.configureTestingModule({}).inject(Injector);
  });

  function create(
    fetch: (filters: Filters, page: number, pageSize: number) => Observable<PagedResult<string>>,
  ) {
    return runInInjectionContext(
      injector,
      () => new PagedList<string, Filters>(fetch, { search: '' }),
    );
  }

  it('loads on construction and clears the loading state', () => {
    const list = create(() => of(page(['a', 'b'])));

    expect(list.items()).toEqual(['a', 'b']);
    expect(list.loading()).toBe(false);
    expect(list.isEmpty()).toBe(false);
  });

  it('returns to page 1 when a filter changes', () => {
    const pages: number[] = [];
    const list = create((_filters, pageNumber) => {
      pages.push(pageNumber);

      return of(page([]));
    });

    list.setPage(4);
    list.setFilter({ search: 'moh' });

    expect(pages).toEqual([1, 4, 1]);
    expect(list.page()).toBe(1);
  });

  it('reports an empty list only once loading has finished without an error', () => {
    const list = create(() => of(page([])));

    expect(list.isEmpty()).toBe(true);
    expect(list.isFiltered()).toBe(false);
  });

  it('surfaces the API message and stops loading when a request fails', () => {
    const list = create(() =>
      throwError(() => new VextoApiError('forbidden', 'You do not have permission.', 403)),
    );

    expect(list.error()).toBe('You do not have permission.');
    expect(list.loading()).toBe(false);
    // An error is not an empty list: the two states say different things to the user.
    expect(list.isEmpty()).toBe(false);
  });

  it('keeps working after a failure, so retry actually retries', () => {
    let fail = true;
    const list = create(() =>
      fail ? throwError(() => new VextoApiError('unavailable', 'Down.', 503)) : of(page(['a'])),
    );

    expect(list.error()).toBe('Down.');

    fail = false;
    list.reload();

    expect(list.error()).toBeNull();
    expect(list.items()).toEqual(['a']);
  });

  it('ignores a slow earlier response when a newer request has been made', () => {
    const first = new Subject<PagedResult<string>>();
    const second = new Subject<PagedResult<string>>();
    let call = 0;
    const list = create(() => (call++ === 0 ? first : second));

    list.setFilter({ search: 'a' });
    second.next(page(['fresh']));
    first.next(page(['stale']));

    expect(list.items()).toEqual(['fresh']);
  });

  it('treats any non-empty filter as filtered, for the empty-state wording', () => {
    const list = create(() => of(page([])));

    list.setFilter({ search: 'zubair' });

    expect(list.isFiltered()).toBe(true);
  });
});
