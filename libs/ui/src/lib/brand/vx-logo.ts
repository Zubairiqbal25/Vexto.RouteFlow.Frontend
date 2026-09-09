import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  INTER_CAP_RATIO,
  VEXTO_LOCKUP_GAP_RATIO,
  VEXTO_MARK_ASPECT,
  VEXTO_MARK_INK_VIEWBOX,
  VEXTO_MARK_ROUTE,
  VEXTO_MARK_ROUTE_WIDTH,
  VEXTO_MARK_WAYPOINT,
  VEXTO_WORDMARK_CAP_RATIO,
} from './vexto-mark.geometry';

/** Which surface the logo is sitting on. */
export type VxLogoTone = 'brand' | 'on-dark' | 'mono';

/** Mark alone, or the mark with the wordmark beside it. */
export type VxLogoVariant = 'mark' | 'horizontal';

/**
 * The Vexto logo: two converging route strokes and a detached waypoint, optionally with the
 * wordmark beside it.
 *
 * Drawn inline from `vexto-mark.geometry.ts` rather than loaded from `/favicon.svg` or an
 * `<img>`, for three reasons that all matter here:
 *
 * - it inherits colour, so one component serves the light page, the permanently-dark rail and a
 *   monochrome context without three files to keep in step;
 * - it costs no request, so the collapsed sidebar and the boot state have no flash of nothing;
 * - it is real DOM, so it prints and scales with the user's zoom.
 *
 * The geometry file is generated from the same source as `branding/*.svg`, so this and the
 * downloadable assets cannot become different logos.
 *
 * **The wordmark is live text**, not a path. The apps already load Inter, the weight and colour
 * come from tokens, and a screen reader reads a word rather than announcing an image. The outlined
 * `branding/vexto-wordmark.svg` exists for everywhere Inter is not guaranteed — email, PDF, print.
 */
@Component({
  selector: 'vx-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center', '[style.gap.px]': 'gap()' },
  template: `
    <svg
      [attr.viewBox]="viewBox"
      [attr.width]="markWidth()"
      [attr.height]="height()"
      [attr.role]="labelled() ? 'img' : null"
      [attr.aria-label]="labelled() ? label() : null"
      [attr.aria-hidden]="labelled() ? null : 'true'"
      [style.color]="markColor()"
      class="flex-none overflow-visible"
    >
      <path
        [attr.d]="route"
        fill="none"
        stroke="currentColor"
        [attr.stroke-width]="routeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle
        [attr.cx]="waypoint.cx"
        [attr.cy]="waypoint.cy"
        [attr.r]="waypoint.r"
        fill="currentColor"
      />
    </svg>

    @if (variant() === 'horizontal') {
      <span
        class="flex-none font-semibold tracking-tight"
        [style.font-size.px]="wordSize()"
        [style.line-height]="1"
        [style.color]="wordColor()"
        >Vexto</span
      >
    }
  `,
})
export class VxLogo {
  /**
   * Height of the mark's **ink**, in pixels — what it measures on screen, not a padded box.
   *
   * 20px suits a sidebar or a top bar; the documented minimum for the mark is 16px. Everything
   * else in the lockup is derived from this, so a caller sets one number.
   */
  readonly height = input(20);

  readonly variant = input<VxLogoVariant>('horizontal');

  /**
   * `brand` for a light page, `on-dark` for the nav rail and the mobile header, `mono` to inherit
   * `currentColor` for both halves.
   */
  readonly tone = input<VxLogoTone>('brand');

  /**
   * The accessible name. Pass `''` where the logo is decorative or where an ancestor already names
   * it — an `<a aria-label="Vexto home">`, for instance — so it is not announced twice.
   *
   * Ignored for the horizontal variant, whose wordmark is real text and names itself.
   */
  readonly label = input('Vexto');

  protected readonly viewBox = VEXTO_MARK_INK_VIEWBOX;
  protected readonly route = VEXTO_MARK_ROUTE;
  protected readonly routeWidth = VEXTO_MARK_ROUTE_WIDTH;
  protected readonly waypoint = VEXTO_MARK_WAYPOINT;

  protected readonly markWidth = computed(
    () => Math.round(this.height() * VEXTO_MARK_ASPECT * 100) / 100,
  );

  /** One waypoint diameter, the same rule the clear space uses. */
  protected readonly gap = computed(
    () => Math.round(this.height() * VEXTO_LOCKUP_GAP_RATIO * 100) / 100,
  );

  /**
   * The wordmark's font size, derived so its **cap height** lands at the lockup's ratio of the
   * mark's ink height. Setting a font size directly is what makes a lockup look off by a hair at
   * every size but one.
   */
  protected readonly wordSize = computed(
    () =>
      Math.round(((this.height() * VEXTO_WORDMARK_CAP_RATIO) / INTER_CAP_RATIO) * 100) / 100,
  );

  protected readonly markColor = computed(() => {
    switch (this.tone()) {
      case 'on-dark':
        return 'var(--vexto-brand-on-dark)';
      case 'mono':
        return 'currentColor';
      default:
        return 'var(--vexto-primary)';
    }
  });

  protected readonly wordColor = computed(() => {
    switch (this.tone()) {
      case 'on-dark':
        return '#ffffff';
      case 'mono':
        return 'currentColor';
      default:
        return 'var(--vexto-text-primary)';
    }
  });

  /** The mark carries the accessible name only when there is no wordmark to do it. */
  protected readonly labelled = computed(
    () => this.variant() === 'mark' && this.label().length > 0,
  );
}
