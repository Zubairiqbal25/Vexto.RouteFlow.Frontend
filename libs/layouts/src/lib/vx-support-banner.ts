import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService } from '@vexto/auth';
import { VxIcon } from '@vexto/ui';

/**
 * "You are inside somebody else's operator right now."
 *
 * A ServiceAdmin who enters a tenant's support context sees that operator's screens, with that
 * operator's data, laid out exactly as the operator's own staff see them. The tenant selector in
 * the top bar names the tenant, but it is a 200px control among five others, and somebody two hours
 * into a support session stops reading it — which is how a platform administrator edits a real
 * customer's passenger believing they are looking at their own test tenant.
 *
 * So the banner is deliberately unmissable and deliberately not dismissible: full width, above
 * everything, in the warning colour, with the operator's name in it and one way out. It costs
 * 40 pixels of a screen nobody spends their working day on.
 *
 * **It is shown only when a ServiceAdmin has actually entered a tenant.** A tenant user never sees
 * it — they are not in support mode, they are just at work — and neither does a ServiceAdmin in the
 * cross-tenant platform view, where there is nothing to exit.
 *
 * Exiting navigates to the platform tenant list rather than staying put, for the same reason
 * `VxTenantSelector` does: the screen you were on was showing that operator's records, and
 * repainting the same route with nothing behind it is not a neutral place to land.
 */
@Component({
  selector: 'vx-support-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    @if (tenant(); as supported) {
      <div
        role="status"
        class="flex items-center gap-3 px-4 py-2 text-meta sm:px-6"
        style="background: var(--vexto-warning-soft); color: var(--vexto-warning-text)"
      >
        <vx-icon name="shield" [size]="16" />

        <span class="font-semibold uppercase tracking-wide">Service admin support mode</span>

        <span class="min-w-0 flex-1 truncate font-medium">{{ supported.name }}</span>

        <button
          type="button"
          class="flex-none rounded-md border px-2.5 py-1 font-medium transition-colors
                 hover:bg-surface-hover"
          style="border-color: currentColor"
          (click)="exit()"
        >
          Exit tenant
        </button>
      </div>
    }
  `,
})
export class VxSupportBanner {
  private readonly context = inject(TenantContextService);
  private readonly router = inject(Router);

  /** The operator being supported, or null — which covers every tenant user and the platform view. */
  protected readonly tenant = this.context.current;

  protected exit(): void {
    this.context.leave();
    void this.router.navigateByUrl('/platform/tenants');
  }
}
