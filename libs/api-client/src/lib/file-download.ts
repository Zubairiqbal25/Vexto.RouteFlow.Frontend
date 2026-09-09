import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { toApiError } from './api-error';

/**
 * Saves a file served from an authorized Vexto endpoint.
 *
 * **Why a service rather than an `<a href>`.** Agreement documents are served from an endpoint that
 * re-checks the tenant on every request, so the request carries a bearer token — and a browser will
 * not attach one to a plain link. The bytes are fetched through `HttpClient`, which the auth
 * interceptor already decorates, and handed to a temporary object URL so the browser's own save
 * dialog does the rest. The alternative, a signed public URL, would be a second authorization
 * scheme to keep correct and a link that keeps working after it is pasted into a group chat.
 *
 * The object URL is revoked once the click has been dispatched: a downloaded contract pinned in
 * memory for the life of the tab is a copy of a document nobody asked us to keep.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloader {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(VEXTO_CONFIG).apiBaseUrl.replace(/\/+$/u, '');

  /**
   * Fetches `path` and offers it to the user as `fileName`.
   *
   * `path` is an API path, not a full URL: the API's address is runtime configuration and a
   * component should not know it. Errors arrive as `VextoApiError`, the same as every other call.
   */
  save(path: string, fileName: string): Observable<void> {
    return this.http.get(`${this.baseUrl}${path}`, { responseType: 'blob' }).pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        link.click();

        // Revoked on the next turn of the event loop rather than immediately: the click is
        // dispatched synchronously, but some browsers read the blob after the handler returns.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }),
      catchError((error: unknown) => throwError(() => toApiError(error))),
    );
  }
}
