import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlatformApi } from '@vexto/api-client';
import { TenantContextService } from '@vexto/auth';
import { ToastService, VxErrorState } from '@vexto/ui';

/**
 * The landing point for "Open in Operator Portal" from the CMS.
 *
 * The CMS and this portal are separate origins, so a support context chosen there cannot travel in
 * storage; it arrives as the tenant id in this URL. What happens next is exactly what the tenant
 * selector does when a ServiceAdmin picks an operator: the tenant is looked up through the platform
 * API (which is what proves the caller may see it at all), recorded in `TenantContextService`, and
 * the portal moves to the dashboard.
 *
 * **Nothing here grants anything.** A tenant user who follows this link is refused by the
 * `Tenants.View` guard on the route; and even if they were not, `TenantContextService.enter` is a
 * no-op for anybody without the ServiceAdmin claim, and the API rejects the support-context header
 * from anybody without it on every request. The URL is a convenience for somebody already
 * privileged — signed in, or about to sign in by email code with this page as the return URL.
 */
@Component({
  selector: 'vexto-support-enter-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxErrorState],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not open this tenant" [message]="message" (retry)="enter()" />
      <p class="mt-4 text-center"><a class="vx-btn vx-btn-ghost" routerLink="/platform/tenants">Back to tenants</a></p>
    } @else {
      <div class="mx-auto max-w-md py-16 text-center">
        <div class="vx-skeleton mx-auto h-4 w-48"></div>
        <p class="mt-4 text-body text-ink-muted">Entering tenant support context…</p>
      </div>
    }
  `,
})
export class SupportEnterPage {
  private readonly platform = inject(PlatformApi);
  private readonly context = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Bound from the route by `withComponentInputBinding`. */
  readonly tenantId = input.required<string>();

  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.tenantId();
      this.enter();
    });
  }

  protected enter(): void {
    this.error.set(null);

    if (!this.context.canSwitch()) {
      this.error.set('Only a Vexto platform administrator can enter a tenant support context.');

      return;
    }

    this.platform.get(this.tenantId()).subscribe({
      next: (detail) => {
        this.context.enter({
          id: detail.tenant.id,
          name: detail.tenant.name,
          status: detail.tenant.status,
          location: detail.tenant.businessDetails.emirate,
        });
        this.toast.success(`You are now working in ${detail.tenant.name}.`);
        void this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      },
      error: () => this.error.set('The tenant could not be found, or you are not allowed to see it.'),
    });
  }
}
