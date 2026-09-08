import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * One outcome in a segmented progress bar.
 *
 * `tone` is a status-token suffix (`success`, `warning`, `danger`, `info`, `neutral`), so the
 * segment colours come from the same pairs every badge in the product uses and dark mode is free.
 */
export interface VxProgressSegment {
  readonly label: string;
  readonly value: number;
  readonly tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
}

/**
 * A segmented progress bar with a written legend.
 *
 * Built for trip attendance — boarded, still expected, skipped, blocked, no-show — and reusable for
 * anything that is a set of outcomes over a fixed total.
 *
 * **The legend is not optional decoration.** Colour alone cannot distinguish five segments for
 * somebody who does not separate the hues, and a bar with no numbers is a bar nobody can act on: a
 * dispatcher deciding whether to call a driver needs "2 no-show", not "a bit of orange". The bar is
 * the glance; the legend is the answer.
 *
 * Zero-value segments are dropped from both the bar and the legend. "0 blocked" on every trip is
 * noise that makes the one trip with a blocked passenger harder to spot.
 */
@Component({
  selector: 'vx-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2">
      @if (headline()) {
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-body font-semibold tabular-nums text-ink">{{ headline() }}</span>
          @if (caption(); as text) {
            <span class="text-meta text-ink-muted">{{ text }}</span>
          }
        </div>
      }

      <div
        class="flex h-2 w-full overflow-hidden rounded-full"
        style="background: var(--vexto-surface-sunken)"
        role="img"
        [attr.aria-label]="summary()"
      >
        @for (segment of visible(); track segment.label) {
          <span
            class="h-full transition-[width] duration-500 ease-out"
            [style.width.%]="segment.percent"
            [style.background]="'var(--vexto-' + segment.tone + ')'"
          ></span>
        }
      </div>

      @if (showLegend()) {
        <ul class="flex flex-wrap gap-x-4 gap-y-1">
          @for (segment of visible(); track segment.label) {
            <li class="flex items-center gap-1.5 text-meta text-ink-secondary">
              <span
                class="size-2 flex-none rounded-full"
                [style.background]="'var(--vexto-' + segment.tone + ')'"
                aria-hidden="true"
              ></span>
              <span class="tabular-nums font-medium text-ink">{{ segment.value }}</span>
              {{ segment.label }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class VxProgressBar {
  readonly segments = input.required<readonly VxProgressSegment[]>();

  /**
   * The denominator. Defaults to the sum of the segments, which is right for attendance — every
   * passenger is in exactly one state — and overridable for a total that includes states not shown.
   */
  readonly total = input<number | null>(null);

  /** e.g. "8 / 24 boarded". Omitted when the caller renders its own heading. */
  readonly headline = input<string | null>(null);
  readonly caption = input<string | null>(null);
  readonly showLegend = input(true);

  private readonly denominator = computed(() => {
    const explicit = this.total();

    return explicit && explicit > 0
      ? explicit
      : this.segments().reduce((sum, segment) => sum + segment.value, 0) || 1;
  });

  protected readonly visible = computed(() =>
    this.segments()
      .filter((segment) => segment.value > 0)
      .map((segment) => ({
        ...segment,
        percent: (segment.value / this.denominator()) * 100,
      })),
  );

  protected readonly summary = computed(() => {
    const visible = this.visible();

    return visible.length === 0
      ? 'Nothing recorded yet.'
      : visible.map((segment) => `${segment.value} ${segment.label}`).join(', ');
  });
}

/**
 * How serious something is, in the four levels the product uses.
 *
 * A shared vocabulary rather than each screen picking a colour: "licence expires in seven days" and
 * "tracking has gone offline" are the same level of concern and should look it. `critical` is
 * reserved for something that has stopped working or been cancelled — if everything is critical,
 * the screen is red and nothing stands out.
 */
export type VxAttention = 'normal' | 'info' | 'warning' | 'critical';

/** The status token each attention level maps to. */
export const ATTENTION_TONE: Readonly<Record<VxAttention, string>> = {
  normal: 'neutral',
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

/**
 * A short operational notice inside a card.
 *
 * Always carries its text — never a bare coloured strip — because the whole point is that somebody
 * scanning forty cards can read *why* one of them wants attention.
 */
@Component({
  selector: 'vx-attention-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-meta font-medium"
      [style.background]="'var(--vexto-' + tone() + '-soft)'"
      [style.color]="'var(--vexto-' + tone() + '-text)'"
      role="status"
    >
      <ng-content />
    </p>
  `,
})
export class VxAttentionNote {
  readonly level = input<VxAttention>('warning');

  protected readonly tone = computed(() => ATTENTION_TONE[this.level()]);
}
