import { ActivatedRoute } from '@angular/router';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/**
 * Opens a list page's create form when it was reached with `?new=1`.
 *
 * The command palette's quick actions ("Create passenger") need a way to say *create*, not merely
 * *navigate*, and a list page's form is a signal inside that component rather than a route. A query
 * parameter is the smallest thing that bridges the two: it needs no shared service, it survives a
 * page refresh, and — the reason it beats a service — the resulting URL is a link somebody can put
 * in a runbook or a bookmark.
 *
 * Subscribed rather than read from the snapshot, so triggering the same action twice in a row from
 * the palette re-opens the form instead of silently doing nothing on a route Angular reuses.
 */
export function openFormOnNewParam(open: () => void): void {
  const route = inject(ActivatedRoute);
  const destroyRef = inject(DestroyRef);

  route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((params) => {
    if (params.get('new') !== null) {
      open();
    }
  });
}
