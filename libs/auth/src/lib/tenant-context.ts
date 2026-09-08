import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { AuthStore } from './auth-store';

/** The tenant a platform administrator is currently supporting, or the platform itself. */
export interface SupportTenant {
  readonly id: string;
  readonly name: string;
  readonly status?: string | null;
  readonly location?: string | null;
}

const STORAGE_KEY = 'vexto.tenantContext';

/**
 * Which operator a ServiceAdmin is currently working inside.
 *
 * **Only ever meaningful for a platform super administrator.** A normal tenant user's tenant comes
 * from their token and cannot be changed; this service refuses to hold a value for them, and the
 * interceptor below therefore never sends the header on their behalf. That matters: the API
 * *rejects* the header from a non-ServiceAdmin with a 403 rather than ignoring it, so a stray value
 * here would break every request the user makes.
 *
 * `null` means the platform context — the cross-tenant view. It is a real state, not "nothing
 * selected": a ServiceAdmin looking at the tenant list is deliberately not inside any tenant.
 *
 * The choice is remembered across reloads so a support session survives a refresh, and cleared on
 * sign-out so the next person to use the machine does not inherit it.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly store = inject(AuthStore);
  private readonly document = inject(DOCUMENT);

  private readonly selected = signal<SupportTenant | null>(this.read());

  /** True when this account may enter another operator's context at all. */
  readonly canSwitch = computed(() => this.store.user()?.isServiceAdmin === true);

  /** The tenant being supported, or null for the platform context. */
  readonly current = computed(() => (this.canSwitch() ? this.selected() : null));

  /** The id sent as `X-Vexto-Tenant-Context`, or null when no header should be sent. */
  readonly currentId = computed(() => this.current()?.id ?? null);

  /**
   * What the selector shows. For a platform administrator it is the tenant they entered, or
   * "Platform Overview"; for everybody else it is their own tenant, which they cannot change.
   */
  readonly label = computed(() => {
    if (!this.canSwitch()) {
      return this.store.tenantName();
    }

    return this.current()?.name ?? 'Platform Overview';
  });

  enter(tenant: SupportTenant): void {
    if (!this.canSwitch()) {
      return;
    }

    this.selected.set(tenant);
    this.write(tenant);
  }

  /** Leaves the tenant and returns to the cross-tenant platform view. */
  leave(): void {
    this.selected.set(null);
    this.write(null);
  }

  private read(): SupportTenant | null {
    try {
      const raw = this.document.defaultView?.localStorage?.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<SupportTenant>) : null;

      return parsed?.id && parsed.name ? (parsed as SupportTenant) : null;
    } catch {
      return null;
    }
  }

  private write(tenant: SupportTenant | null): void {
    try {
      const storage = this.document.defaultView?.localStorage;

      if (tenant) {
        storage?.setItem(STORAGE_KEY, JSON.stringify(tenant));
      } else {
        storage?.removeItem(STORAGE_KEY);
      }
    } catch {
      // The context simply will not survive a reload.
    }
  }
}

/**
 * Adds `X-Vexto-Tenant-Context` when a platform administrator has entered a tenant.
 *
 * Deliberately conservative about when it fires. The API refuses the header outright from anyone
 * who is not a ServiceAdmin — a refusal, not a silent ignore — so sending it speculatively would
 * turn every request from a normal user into a 403. `TenantContextService.currentId` is null unless
 * the signed-in account genuinely holds the privilege, which is what makes this safe.
 *
 * The platform surface is excluded: `/api/v1/platform/...` is cross-tenant by design, and naming a
 * tenant while listing every tenant is a contradiction.
 */
export const tenantContextInterceptor: HttpInterceptorFn = (request, next) => {
  const context = inject(TenantContextService);
  const tenantId = context.currentId();

  if (!tenantId || request.url.includes('/api/v1/platform/')) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { 'X-Vexto-Tenant-Context': tenantId } }));
};
