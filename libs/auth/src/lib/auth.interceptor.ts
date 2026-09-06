import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth-store';
import { AuthService } from './auth.service';

/** Endpoints that must never carry a bearer token or trigger a refresh loop. */
function isAuthEndpoint(request: HttpRequest<unknown>): boolean {
  return (
    request.url.includes('/api/v1/auth/login') ||
    request.url.includes('/api/v1/auth/refresh') ||
    request.url.includes('/api/v1/auth/logout')
  );
}

/**
 * Attaches the access token, and recovers from an expired one exactly once per request.
 *
 * A 401 means the token has expired or been revoked. The first thing to try is a refresh; if that
 * also fails the session is genuinely over and the user is sent to sign in with their intended URL
 * preserved. A 401 on the refresh call itself is never retried — that is the loop this guards.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthStore);
  const auth = inject(AuthService);

  const withToken = (token: string | null) =>
    token
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  if (isAuthEndpoint(request)) {
    return next(request);
  }

  return next(withToken(store.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap((token) => next(withToken(token))),
        catchError((refreshError: unknown) => {
          auth.redirectToLogin();

          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
