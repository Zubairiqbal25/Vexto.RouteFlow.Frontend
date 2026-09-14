import { inject } from '@angular/core';
import { type CanActivateFn, Router, type UrlTree } from '@angular/router';
import { AuthStore } from '@vexto/auth';
import { PermissionService } from '@vexto/permissions';

/**
 * Lets only a platform administrator into the CMS tenant management area.
 *
 * The same shape as `cmsGuard`, for the same reason: a courtesy, not a security control. Every
 * `/api/v1/platform/tenants` endpoint checks `Tenants.View` or `Tenants.Manage` for itself, and a
 * tenant administrator who reached a page here would see nothing but 403s. The guard decides the
 * experience — they are told plainly and sent to the access-denied page.
 *
 * It asks for the permission, not the role. `Tenants.View` is granted to no tenant role, and a
 * ServiceAdmin satisfies it through the single bypass.
 */
export const tenantsGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (!store.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  return inject(PermissionService).has('Tenants.View')
    ? true
    : router.createUrlTree(['/access-denied']);
};
