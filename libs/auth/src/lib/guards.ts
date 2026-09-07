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
export const anonymousGuard: CanActivateFn = (route): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (!store.isAuthenticated()) {
    return true;
  }

  // Where a signed-in person belongs instead. It comes from the route, because each app has a
  // different landing screen: the operator's is the dashboard, the driver's is today's trips.
  //
  // It must never be '/'. Redirecting to the URL being guarded sends the router straight back
  // through this guard, and the loop spins without yielding — the tab stops responding entirely
  // rather than failing visibly. Falling through to the sign-in shell is the safe answer when no
  // home is configured: it is wrong, but it renders.
  const home = route.data['home'];

  return typeof home === 'string' && home !== '/' ? router.createUrlTree([home]) : true;
};
