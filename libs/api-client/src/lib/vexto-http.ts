import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { toApiError } from './api-error';

/** Query values a caller may pass; `undefined` and `null` are dropped rather than sent as "null". */
export type QueryValue = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, QueryValue>>;

function toParams(query: Query | undefined): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }

  return params;
}

/**
 * The single seam between the application and HTTP.
 *
 * Feature services are built on this rather than on `HttpClient` directly, so the base address,
 * the error translation and the query-string conventions exist once. Components never see either.
 */
@Injectable({ providedIn: 'root' })
export class VextoHttp {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(VEXTO_CONFIG).apiBaseUrl.replace(/\/+$/u, '');

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(query) }).pipe(this.translate());
  }

  post<T>(path: string, body?: unknown, query?: Query): Observable<T> {
    return this.http
      .post<T>(this.url(path), body ?? {}, { params: toParams(query) })
      .pipe(this.translate());
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body).pipe(this.translate());
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path)).pipe(this.translate());
  }

  upload<T>(path: string, form: FormData): Observable<T> {
    return this.http.post<T>(this.url(path), form).pipe(this.translate());
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private translate<T>() {
    return (source: Observable<T>) =>
      source.pipe(catchError((error: unknown) => throwError(() => toApiError(error))));
  }
}
