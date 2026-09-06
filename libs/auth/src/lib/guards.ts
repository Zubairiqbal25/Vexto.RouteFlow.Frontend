import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { AuthStore } from './auth-store';

/** Requires a session. Anything else is sent to sign in with the intended URL preserved. */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (store.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps a signed-in user away from the login screen. */
export const anonymousGuard: CanActivateFn = (): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  return store.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
