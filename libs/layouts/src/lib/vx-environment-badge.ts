import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Which deployment you are looking at, when it is not the real one.
 *
 * The three Angular apps are identical in UAT and in production — same build, same styling, same
 * data shapes — and the only thing distinguishing them is a hostname in a tab somebody stopped
 * reading an hour ago. That is how a demonstration gets given against the wrong environment, and
 * how a bug gets filed against data that was seeded for testing.
 *
 * **Nothing is rendered in production.** `environmentName` comes from `/config.json`, and an empty
 * or `Production` value produces no element at all. A permanent banner on the real product is
 * chrome the operator's staff would learn to ignore within a week, and it would take the UAT
 * badge's meaning with it — a warning that is always on is not a warning.
 */
@Component({
  selector: 'vx-environment-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label; as name) {
      <span
        class="inline-flex select-none items-center rounded-full px-2 py-0.5 text-[0.6875rem]
               font-semibold uppercase tracking-wide"
        style="background: var(--vexto-warning-soft); color: var(--vexto-warning-text)"
        [attr.title]="'This is the ' + name + ' environment, not production.'"
        >{{ name }}</span
      >
    }
  `,
})
export class VxEnvironmentBadge {
  private readonly config = inject(VEXTO_CONFIG);

  /** The environment name, or null in production and wherever nothing was configured. */
  protected readonly label = ((): string | null => {
    const name = (this.config.environmentName ?? '').trim();

    if (!name || name.toLowerCase() === 'production') {
      return null;
    }

    return name.toUpperCase();
  })();
}
