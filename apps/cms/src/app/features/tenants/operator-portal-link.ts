import { DOCUMENT, Injectable, inject } from '@angular/core';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Hands a ServiceAdmin across to the operator portal, inside one tenant's support context.
 *
 * **What this does and does not decide.** The CMS and the operator portal are separate origins, so
 * a support context chosen here cannot travel in storage. It travels as the tenant id in the operator
 * portal's `/platform/support/{id}` URL. That route is guarded on `Tenants.View`, the page acts only
 * for a signed-in ServiceAdmin — `TenantContextService.canSwitch` — and every request it then makes carries the
 * `X-Vexto-Tenant-Context` header, which the API validates on each call: the caller must hold the
 * ServiceAdmin claim in a signed token and the tenant must exist, or the request is refused with
 * 403. A tenant user who pasted the same link gets their own tenant from their token and nothing
 * else. The link is a convenience; the authorization is the server's.
 */
@Injectable({ providedIn: 'root' })
export class OperatorPortalLink {
  private readonly config = inject(VEXTO_CONFIG);
  private readonly document = inject(DOCUMENT);

  /** False when the deployment has not said where the operator portal is. */
  readonly available = Boolean(this.config.operatorPortalUrl);

  url(tenantId: string): string {
    const base = this.config.operatorPortalUrl.replace(/\/+$/u, '');

    return `${base}/platform/support/${encodeURIComponent(tenantId)}`;
  }

  /** Opens the portal in a new tab, so the CMS session stays where it is. */
  open(tenantId: string): void {
    if (!this.available) {
      return;
    }

    this.document.defaultView?.open(this.url(tenantId), '_blank', 'noopener');
  }
}
