import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * One point on a chart. `label` is what the axis and the tooltip show; `value` is the number.
 */
export interface VxChartPoint {
  readonly label: string;
  readonly value: number;
}

/**
 * Vexto's charts are hand-drawn SVG, and that is a deliberate choice rather than a shortcut.
 *
 * The product needs exactly three shapes — a trend area, a comparison bar, and a completion ring —
 * over series of thirty points at most. Chart.js, ApexCharts or ECharts would each add 150–500 KB
 * to a dashboard bundle, come with their own theming system that has to be kept in step with the
 * token layer, and repaint on a canvas that cannot inherit `currentColor` when the theme changes.
 *
 * These read tokens directly, so dark mode is free and correct; they are DOM, so they are
 * inspectable, printable, and reachable by a screen reader through the summary each one renders;
 * and there is no second visual language to reconcile with the rest of the design system. If Vexto
 * ever needs zoom, brushing or real-time streaming, that is the moment to take the dependency — and
 * to take exactly one.
 *
 * Every chart here also carries a text alternative. A picture of a trend is not accessible to
 * everyone, and the underlying numbers are small enough to state.
 */

/**
 * A smooth area chart for a trend over time.
 *
 * Used for trips per day and payment collection. The curve is a Catmull-Rom spline converted to
 * cubic béziers, which is what makes it read as a trend rather than as a polygon — but it is
 * clamped so it can never overshoot below zero and imply a negative day that did not happen.
 */
@Component({
  selector: 'vx-area-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="m-0">
      <div class="relative" [style.height.px]="height()">
        <svg
          class="h-full w-full overflow-visible"
          [attr.viewBox]="'0 0 ' + width + ' ' + height()"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="summary()"
          (pointerleave)="hover.set(null)"
        >
          <defs>
            <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" [attr.stop-color]="'var(--vexto-chart-area-from)'" />
              <stop offset="100%" [attr.stop-color]="'var(--vexto-chart-area-to)'" />
            </linearGradient>
          </defs>

          <!-- Four horizontal rules. Enough to read a value against, few enough to stay quiet. -->
          @for (line of gridLines(); track line) {
            <line
              x1="0"
              [attr.y1]="line"
              [attr.x2]="width"
              [attr.y2]="line"
              stroke="var(--vexto-chart-grid)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }

          @if (areaPath()) {
            <path [attr.d]="areaPath()" [attr.fill]="'url(#' + gradientId + ')'" />
            <path
              [attr.d]="linePath()"
              fill="none"
              stroke="var(--vexto-chart-1)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          }

          @if (hovered(); as point) {
            <line
              [attr.x1]="point.x"
              y1="0"
              [attr.x2]="point.x"
              [attr.y2]="height()"
              stroke="var(--vexto-chart-axis)"
              stroke-width="1"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <circle
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              r="4"
              fill="var(--vexto-surface)"
              stroke="var(--vexto-chart-1)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          }

          <!-- One transparent band per point, so the whole column is a hover target rather than a
               2px line that a mouse can never quite land on. -->
          @for (band of bands(); track band.index) {
            <rect
              [attr.x]="band.x"
              y="0"
              [attr.width]="band.width"
              [attr.height]="height()"
              fill="transparent"
              (pointerenter)="hover.set(band.index)"
            />
          }
        </svg>

        @if (hovered(); as point) {
          <div
            class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-meta shadow-pop"
            style="background: var(--vexto-surface-raised); border: 1px solid var(--vexto-border)"
            [style.left.%]="(point.x / width) * 100"
            [style.top.px]="point.y - 10"
          >
            <p class="font-semibold text-ink">{{ point.value }}</p>
            <p class="text-ink-muted">{{ point.label }}</p>
          </div>
        }
      </div>

      @if (showAxis()) {
        <div class="mt-2 flex justify-between text-[0.6875rem] text-ink-muted">
          <span>{{ points()[0]?.label }}</span>
          <span>{{ points()[points().length - 1]?.label }}</span>
        </div>
      }

      <figcaption class="sr-only">{{ summary() }}</figcaption>
    </figure>
  `,
})
export class VxAreaChart {
  /** Oldest first. */
  readonly points = input.required<readonly VxChartPoint[]>();
  readonly height = input(180);
  readonly showAxis = input(true);
  /** Named in the accessible summary, e.g. "trips". */
  readonly unit = input('');

  protected readonly width = 600;
  protected readonly gradientId = `vx-area-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly hover = signal<number | null>(null);

  private readonly scale = computed(() => {
    const values = this.points().map((point) => point.value);
    const max = Math.max(...values, 1);

    // The floor is always zero. A trend chart whose baseline is the minimum value exaggerates every
    // wobble into a cliff, which is the single most common way a dashboard lies.
    return { max, height: this.height() };
  });

  private readonly coords = computed(() => {
    const points = this.points();

    if (points.length === 0) {
      return [];
    }

    const { max } = this.scale();
    const step = points.length > 1 ? this.width / (points.length - 1) : 0;
    const usable = this.height() - 8;

    return points.map((point, index) => ({
      index,
      x: points.length > 1 ? index * step : this.width / 2,
      y: this.height() - (point.value / max) * usable,
      label: point.label,
      value: point.value,
    }));
  });

  protected readonly gridLines = computed(() =>
    [0.25, 0.5, 0.75, 1].map((fraction) => (this.height() * fraction).toFixed(1)),
  );

  protected readonly bands = computed(() => {
    const coords = this.coords();

    if (coords.length === 0) {
      return [];
    }

    const width = this.width / coords.length;

    return coords.map((point) => ({
      index: point.index,
      x: point.x - width / 2,
      width,
    }));
  });

  protected readonly hovered = computed(() => {
    const index = this.hover();

    return index === null ? null : (this.coords()[index] ?? null);
  });

  protected readonly linePath = computed(() => {
    const coords = this.coords();

    if (coords.length < 2) {
      return '';
    }

    return smoothPath(coords, this.height());
  });

  protected readonly areaPath = computed(() => {
    const line = this.linePath();
    const coords = this.coords();

    if (!line || coords.length < 2) {
      return '';
    }

    const first = coords[0]!;
    const last = coords[coords.length - 1]!;

    return `${line} L ${last.x} ${this.height()} L ${first.x} ${this.height()} Z`;
  });

  protected readonly summary = computed(() => {
    const points = this.points();

    if (points.length === 0) {
      return 'No data available.';
    }

    const total = points.reduce((sum, point) => sum + point.value, 0);
    const unit = this.unit() ? ` ${this.unit()}` : '';

    return `${points.length} points from ${points[0]!.label} to ${points[points.length - 1]!.label}. Total ${total}${unit}. Highest ${Math.max(...points.map((p) => p.value))}${unit} on ${points.reduce((best, p) => (p.value > best.value ? p : best)).label}.`;
  });
}

/**
 * Builds a smooth path through the points, clamped so the curve never dips below the floor.
 *
 * A plain cubic through control points derived from neighbours will overshoot after a sharp drop,
 * drawing a dip below zero — which on a trips chart means a day with negative trips. Clamping the
 * control points to the data's own range is cheaper than a monotone spline and is enough here.
 */
function smoothPath(
  coords: readonly { x: number; y: number }[],
  height: number,
): string {
  const clamp = (value: number) => Math.max(0, Math.min(height, value));
  let path = `M ${coords[0]!.x} ${clamp(coords[0]!.y)}`;

  for (let index = 0; index < coords.length - 1; index += 1) {
    const previous = coords[index - 1] ?? coords[index]!;
    const current = coords[index]!;
    const next = coords[index + 1]!;
    const after = coords[index + 2] ?? next;

    // Catmull-Rom to bézier, with the usual 1/6 tension.
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = clamp(current.y + (next.y - previous.y) / 6);
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = clamp(next.y - (after.y - current.y) / 6);

    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next.x.toFixed(2)} ${clamp(next.y).toFixed(2)}`;
  }

  return path;
}

/**
 * A rounded bar chart for comparing a handful of categories.
 *
 * Horizontal, because the things Vexto compares — trip outcomes, attendance states — have labels
 * that are words rather than dates, and a word rotated forty-five degrees under a vertical bar is
 * the classic unreadable dashboard.
 */
@Component({
  selector: 'vx-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="m-0">
      <ul class="flex flex-col gap-3">
        @for (bar of bars(); track bar.label) {
          <li class="grid grid-cols-[minmax(6rem,auto)_1fr_auto] items-center gap-3">
            <span class="truncate text-meta text-ink-secondary" [attr.title]="bar.label">
              {{ bar.label }}
            </span>

            <span
              class="h-2.5 overflow-hidden rounded-full"
              style="background: var(--vexto-surface-sunken)"
            >
              <span
                class="block h-full rounded-full transition-[width] duration-500 ease-out"
                [style.width.%]="bar.percent"
                [style.background]="bar.colour"
              ></span>
            </span>

            <span class="text-meta font-semibold tabular-nums text-ink">{{ bar.value }}</span>
          </li>
        }
      </ul>

      <figcaption class="sr-only">{{ summary() }}</figcaption>
    </figure>
  `,
})
export class VxBarChart {
  readonly points = input.required<readonly VxChartPoint[]>();

  /**
   * A token suffix per bar, in order — `['success', 'danger']` and so on. Falls back to the chart
   * series palette, which is what a set of neutral categories should use: reserving red for
   * "no-show" is meaningful, colouring six routes red-through-green is not.
   */
  readonly tones = input<readonly string[]>([]);

  protected readonly bars = computed(() => {
    const points = this.points();
    const max = Math.max(...points.map((point) => point.value), 1);
    const tones = this.tones();

    return points.map((point, index) => ({
      label: point.label,
      value: point.value,
      percent: (point.value / max) * 100,
      colour: tones[index]
        ? `var(--vexto-${tones[index]})`
        : `var(--vexto-chart-${(index % 6) + 1})`,
    }));
  });

  protected readonly summary = computed(() =>
    this.points().length === 0
      ? 'No data available.'
      : this.points()
          .map((point) => `${point.label}: ${point.value}`)
          .join('. '),
  );
}

/**
 * A completion ring for a single ratio — boarded against expected, collected against invoiced.
 *
 * A ring rather than a bar because it reads at a glance from across a dispatch office, and because
 * the middle is exactly the right place for the number itself.
 */
@Component({
  selector: 'vx-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <figure class="relative m-0 inline-flex items-center justify-center">
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        [attr.viewBox]="'0 0 ' + box + ' ' + box"
        role="img"
        [attr.aria-label]="summary()"
      >
        <circle
          [attr.cx]="box / 2"
          [attr.cy]="box / 2"
          [attr.r]="radius"
          fill="none"
          stroke="var(--vexto-surface-sunken)"
          [attr.stroke-width]="stroke"
        />
        <circle
          [attr.cx]="box / 2"
          [attr.cy]="box / 2"
          [attr.r]="radius"
          fill="none"
          [attr.stroke]="'var(--vexto-' + tone() + ')'"
          [attr.stroke-width]="stroke"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="offset()"
          [attr.transform]="'rotate(-90 ' + box / 2 + ' ' + box / 2 + ')'"
          style="transition: stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)"
        />
      </svg>

      <span class="absolute flex flex-col items-center">
        <span class="text-lg font-semibold tabular-nums text-ink">{{ display() }}</span>
        @if (caption(); as text) {
          <span class="text-[0.6875rem] text-ink-muted">{{ text }}</span>
        }
      </span>

      <figcaption class="sr-only">{{ summary() }}</figcaption>
    </figure>
  `,
})
export class VxProgressRing {
  readonly value = input(0);
  readonly total = input(0);
  readonly size = input(112);
  readonly caption = input<string | null>(null);
  readonly tone = input<'primary' | 'success' | 'warning' | 'danger' | 'info'>('primary');
  readonly label = input('Progress');

  protected readonly box = 44;
  protected readonly stroke = 4;
  protected readonly radius = 20;
  protected readonly circumference = 2 * Math.PI * 20;

  private readonly ratio = computed(() =>
    this.total() > 0 ? Math.min(1, Math.max(0, this.value() / this.total())) : 0,
  );

  protected readonly offset = computed(() => this.circumference * (1 - this.ratio()));

  protected readonly display = computed(() =>
    this.total() > 0 ? `${Math.round(this.ratio() * 100)}%` : '—',
  );

  protected readonly summary = computed(() =>
    this.total() > 0
      ? `${this.label()}: ${this.value()} of ${this.total()}, ${Math.round(this.ratio() * 100)} per cent.`
      : `${this.label()}: no data.`,
  );
}
