import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { AuthStore } from '@vexto/auth';
import { PermissionService } from '@vexto/permissions';

/**
 * Lets only a platform administrator into the CMS.
 *
 * A courtesy, not a security control: every content endpoint checks `Content.View` or
 * `Content.Manage` for itself, and a tenant user who somehow reached a page here would see a
 * screen full of 403s. What this decides is the experience — an operator who signs in to the wrong
 * app is told plainly and sent to the access-denied page rather than to an empty dashboard.
 *
 * It asks for the permission, not the role. `Content.View` is granted to nobody but ServiceAdmin,
 * and a ServiceAdmin satisfies it through the single bypass, so the answer is the same — and the
 * day a second platform role is granted it, nothing here changes.
 */
export const cmsGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (!store.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  return inject(PermissionService).has('Content.View')
    ? true
    : router.createUrlTree(['/access-denied']);
};
