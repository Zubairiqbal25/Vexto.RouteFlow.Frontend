import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApi } from '@vexto/api-client';
import type { AuthenticationResponse } from '@vexto/models';
import { Observable, catchError, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthStore } from './auth-store';

/**
 * Signing in, signing out, and keeping the access token fresh.
 *
 * The refresh is *single-flight*: several requests failing with 401 at once must produce one call
 * to `/auth/refresh`, not one each. The backend rotates and revokes refresh tokens, so a second
 * concurrent refresh would present an already-revoked token and end the session for no reason.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  private inFlightRefresh: Observable<string> | null = null;

  login(email: string, password: string): Observable<AuthenticationResponse> {
    return this.api.login(email, password).pipe(tap((response) => this.store.set(response)));
  }

  /**
   * Ends the session locally whatever the server says.
   *
   * A failed revoke must not strand someone on a screen they asked to leave; the refresh token
   * expires on its own.
   */
  logout(redirectTo = '/login'): void {
    const refreshToken = this.store.refreshToken();

    if (refreshToken) {
      this.api
        .logout(refreshToken)
        .pipe(catchError(() => of(void 0)))
        .subscribe();
    }

    this.store.clear();
    void this.router.navigateByUrl(redirectTo);
  }

  /** Re-reads the profile so permission changes take effect without signing out. */
  refreshProfile(): Observable<unknown> {
    return this.api.me().pipe(tap((user) => this.store.setUser(user)));
  }

  /** Resolves to a new access token, or errors if the session is genuinely over. */
  refreshSession(): Observable<string> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refreshToken = this.store.refreshToken();

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token.'));
    }

    this.inFlightRefresh = this.api.refresh(refreshToken).pipe(
      tap((response) => this.store.set(response)),
      switchMap((response) => of(response.accessToken)),
      tap({
        finalize: () => {
          this.inFlightRefresh = null;
        },
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.inFlightRefresh;
  }

  /** Sends the user to sign in, remembering where they were headed. */
  redirectToLogin(intendedUrl?: string): void {
    this.store.clear();

    const returnUrl = intendedUrl ?? this.router.url;
    const isLoginItself = returnUrl.startsWith('/login');

    void this.router.navigate(['/login'], {
      queryParams: isLoginItself ? {} : { returnUrl },
    });
  }
}
