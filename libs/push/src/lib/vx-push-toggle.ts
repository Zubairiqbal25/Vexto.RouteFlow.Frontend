import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VxIcon } from '@vexto/ui';
import { PushNotifications } from './push-notifications.service';

/**
 * The "Enable notifications" control, shared by the driver and passenger apps.
 *
 * It renders nothing at all when push is unavailable — no Firebase configuration, or a browser
 * without service workers. An inert control that explains why it cannot work is worse than no
 * control: it invites people to try, and to conclude the product is broken.
 *
 * When the browser is blocking, it says so once and offers nothing to press. There is no way to
 * recover a denial from inside a page, so a retry button would be a lie.
 */
@Component({
  selector: 'vx-push-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    @switch (push.state()) {
      @case ('unsupported') {
        <!-- Nothing. See the class remarks. -->
      }

      @case ('denied') {
        <div class="flex items-start gap-2.5 rounded-xl border border-line-subtle px-4 py-3">
          <vx-icon name="bell" [size]="18" class="mt-0.5 flex-none text-ink-muted" />
          <p class="text-meta text-ink-muted">
            Notifications are blocked in your browser settings. Allow them for this site to be told
            when your bus is on the way.
          </p>
        </div>
      }

      @case ('enabled') {
        <div class="flex items-center justify-between gap-3 rounded-xl border border-line-subtle px-4 py-3">
          <span class="flex items-center gap-2.5">
            <vx-icon name="bell" [size]="18" class="text-primary" />
            <span class="text-body font-medium text-ink">Notifications are on</span>
          </span>
          <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="disable()">
            Turn off
          </button>
        </div>
      }

      @case ('failed') {
        <div class="rounded-xl border border-line-subtle px-4 py-3">
          <p class="text-meta text-ink-muted">
            We could not turn notifications on just now.
          </p>
          <button
            type="button"
            class="vx-btn vx-btn-secondary vx-btn-touch mt-3 w-full"
            (click)="enable()"
          >
            Try again
          </button>
        </div>
      }

      @default {
        <button
          type="button"
          class="vx-btn vx-btn-secondary vx-btn-touch w-full"
          [disabled]="push.state() === 'enabling'"
          (click)="enable()"
        >
          <vx-icon name="bell" [size]="18" />
          {{ push.state() === 'enabling' ? 'Turning on…' : 'Enable notifications' }}
        </button>
      }
    }
  `,
})
export class VxPushToggle {
  protected readonly push = inject(PushNotifications);

  /** Only ever from this button press — never on load. See the service remarks. */
  protected enable(): void {
    void this.push.enable();
  }

  protected disable(): void {
    void this.push.disable();
  }
}
