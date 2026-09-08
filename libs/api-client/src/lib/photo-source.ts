import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Turns a Vexto photo endpoint into something an `<img>` can display.
 *
 * **Why this exists at all.** Profile photos are served from authorized endpoints — reading
 * somebody's face needs the same permission as reading their record — so the request carries a
 * bearer token. A browser will not attach one to `<img src="…">`, so the bytes are fetched through
 * `HttpClient` (which the auth interceptor already decorates) and handed to the image as an object
 * URL. The alternative, a signed public URL, would mean a second authorization scheme to keep
 * correct and a link that keeps working after it is pasted somewhere.
 *
 * **Requests are shared and cached per path.** A passenger list renders the same face in a card and
 * again in a quick-view drawer; a driver's manifest may show fifty. `shareReplay` collapses
 * concurrent subscribers to one request, and the resulting object URL is reused for the lifetime of
 * the page.
 *
 * A failure resolves to `null` rather than throwing. A missing photo is the normal case — most
 * people have none — and the caller falls back to initials, which is what the UI does anyway.
 */
@Injectable({ providedIn: 'root' })
export class PhotoSource {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(VEXTO_CONFIG).apiBaseUrl.replace(/\/+$/u, '');
  private readonly cache = new Map<string, Observable<string | null>>();
  private readonly objectUrls = new Set<string>();

  constructor() {
    // Object URLs pin their blob in memory until revoked. The app lives as long as the tab, so this
    // only matters on teardown — but leaking every face a dispatcher scrolled past would be a real
    // cost on a long shift.
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.objectUrls) {
        URL.revokeObjectURL(url);
      }

      this.objectUrls.clear();
      this.cache.clear();
    });
  }

  /**
   * An object URL for the photo at `path`, or `null` when there is none.
   *
   * `path` is an API path such as `/api/v1/passengers/{id}/photo`. Callers pass a path rather than
   * a full URL because the API's address is runtime configuration, and a component should not know
   * it.
   */
  get(path: string): Observable<string | null> {
    const cached = this.cache.get(path);

    if (cached) {
      return cached;
    }

    const request = this.http.get(`${this.baseUrl}${path}`, { responseType: 'blob' }).pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.add(url);

        return url;
      }),
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.cache.set(path, request);

    return request;
  }

  /**
   * Drops a cached photo so the next request re-fetches it.
   *
   * Called after an upload or a delete: the path has not changed, but what is behind it has, and a
   * dispatcher who has just replaced a photo must not keep seeing the old one.
   */
  invalidate(path: string): void {
    this.cache.delete(path);
  }
}
