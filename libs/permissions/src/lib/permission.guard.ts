import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { AuthStore } from '@vexto/auth';
import { PermissionService } from './permission.service';

/**
 * Guards a route on permissions rather than role names.
 *
 * `permissionGuard(Passengers.View)` reads as the rule it enforces; `role === 'Dispatcher'`
 * scattered through the app does not, and breaks the moment a customer's roles differ.
 *
 * A signed-out user is sent to sign in; a signed-in user without the permission gets the
 * access-denied page, because pretending the page does not exist makes support calls harder.
 */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return (_route, state): boolean | UrlTree => {
    const store = inject(AuthStore);
    const router = inject(Router);

    if (!store.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    return inject(PermissionService).hasAny(...permissions)
      ? true
      : router.createUrlTree(['/access-denied']);
  };
}
