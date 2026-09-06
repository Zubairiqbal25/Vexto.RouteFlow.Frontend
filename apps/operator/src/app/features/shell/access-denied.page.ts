import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VxIcon } from '@vexto/ui';

@Component({
  selector: 'vexto-access-denied-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxIcon],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span
        class="mb-5 flex size-14 items-center justify-center rounded-2xl"
        style="background: var(--vexto-warning-soft); color: var(--vexto-warning)"
      >
        <vx-icon name="shield" [size]="26" />
      </span>
      <h1 class="text-xl font-semibold text-ink">Access denied</h1>
      <p class="mt-2 text-body text-ink-muted">
        You are signed in, but your account does not have permission to open this page. Ask an
        administrator if you need access.
      </p>
      <a routerLink="/dashboard" class="vx-btn vx-btn-primary mt-6">Back to dashboard</a>
    </div>
  `,
})
export class AccessDeniedPage {}
