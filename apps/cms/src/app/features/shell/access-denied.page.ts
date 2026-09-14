import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '@vexto/auth';
import { VxIcon } from '@vexto/ui';

/**
 * Where a signed-in account that is not a platform administrator lands.
 *
 * Says plainly which app they should be using and offers sign-out, because the person who arrives
 * here is almost always an operator user who followed the wrong link — not somebody who needs to
 * request access.
 */
@Component({
  selector: 'vexto-cms-access-denied-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span
        class="mb-5 flex size-14 items-center justify-center rounded-2xl"
        style="background: var(--vexto-warning-soft); color: var(--vexto-warning)"
      >
        <vx-icon name="shield" [size]="26" />
      </span>
      <h1 class="text-xl font-semibold text-ink">This is the Vexto CMS</h1>
      <p class="mt-2 text-body text-ink-muted">
        Platform content is managed by Vexto's own administrators. Your account belongs to a
        transport operator, so the pages here are not for it — the operator portal is where your
        work is.
      </p>
      <button type="button" class="vx-btn vx-btn-primary mt-6" (click)="signOut()">Sign out</button>
    </div>
  `,
})
export class CmsAccessDeniedPage {
  private readonly auth = inject(AuthService);

  protected signOut(): void {
    this.auth.logout();
  }
}
