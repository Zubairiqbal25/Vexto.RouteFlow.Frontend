import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VxIcon } from '@vexto/ui';

@Component({
  selector: 'vexto-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxIcon],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span
        class="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted"
      >
        <vx-icon name="search" [size]="26" />
      </span>
      <h1 class="text-xl font-semibold text-ink">Page not found</h1>
      <p class="mt-2 text-body text-ink-muted">
        That page does not exist, or it has moved since the link was created.
      </p>
      <a routerLink="/dashboard" class="vx-btn vx-btn-primary mt-6">Back to dashboard</a>
    </div>
  `,
})
export class NotFoundPage {}
