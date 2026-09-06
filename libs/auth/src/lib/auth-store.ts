import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type { AuthenticatedUser, AuthenticationResponse } from '@vexto/models';

/**
 * Distinguishes the three apps' stored sessions.
 *
 * They are separate origins in development, but may share one in production; a driver signing in on
 * a shared tablet must not inherit the operator portal's session.
 */
export const AUTH_STORAGE_KEY = new InjectionToken<string>('AUTH_STORAGE_KEY');

export interface AuthSession {
  readonly accessToken: string;
  readonly accessTokenExpiresAtUtc: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAtUtc: string;
  readonly user: AuthenticatedUser;
}

function isSession(value: unknown): value is AuthSession {
  const candidate = value as Partial<AuthSession> | null;

  return (
    !!candidate &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    !!candidate.user
  );
}

/**
 * The signed-in session, and the only thing that touches storage.
 *
 * Held in `localStorage` so a refresh does not sign the user out. That is a deliberate trade: the
 * alternative, an in-memory access token with a cookie refresh, needs backend support Vexto does
 * not have yet. Access tokens are short-lived and the refresh token rotates on every use.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly storageKey = inject(AUTH_STORAGE_KEY, { optional: true }) ?? 'vexto.session';

  private readonly _session = signal<AuthSession | null>(this.read());

  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly tenantName = computed(() => this._session()?.user.tenantName ?? null);

  /** Permissions as a set, because guards and the `*vxCan` directive ask this many times a render. */
  readonly permissions = computed(() => new Set(this._session()?.user.permissions ?? []));

  readonly accessToken = computed(() => this._session()?.accessToken ?? null);
  readonly refreshToken = computed(() => this._session()?.refreshToken ?? null);

  set(response: AuthenticationResponse): void {
    const session: AuthSession = {
      accessToken: response.accessToken,
      accessTokenExpiresAtUtc: response.accessTokenExpiresAtUtc,
      refreshToken: response.refreshToken,
      refreshTokenExpiresAtUtc: response.refreshTokenExpiresAtUtc,
      user: response.user,
    };

    this._session.set(session);
    this.write(session);
  }

  /** Replaces the profile without disturbing the tokens — used after `GET /auth/me`. */
  setUser(user: AuthenticatedUser): void {
    const current = this._session();

    if (!current) {
      return;
    }

    const next = { ...current, user };
    this._session.set(next);
    this.write(next);
  }

  clear(): void {
    this._session.set(null);

    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Signing out in memory is enough.
    }
  }

  private read(): AuthSession | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;

      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(session: AuthSession): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      // As above: an unwritable store degrades to a session that ends when the tab closes.
    }
  }
}
