import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type StatusTone, statusLabel, statusTone } from '@vexto/models';
import { VxIcon, type VxIconName } from './icon/vx-icon';

/**
 * The status pill used everywhere a record has a state.
 *
 * Colour is never the only signal: every badge carries its label, and a dot gives a second,
 * non-chromatic cue. Pass `status` for a backend enum name (it is coloured and humanised by the
 * shared map in `@vexto/models`) or `tone` + `label` for a one-off.
 */
@Component({
  selector: 'vx-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <span class="vx-badge" [class]="'vx-tone-' + resolvedTone()">
      @if (icon(); as name) {
        <vx-icon [name]="name" [size]="13" [strokeWidth]="2" />
      } @else {
        <span class="vx-badge-dot"></span>
      }
      {{ text() }}
    </span>
  `,
})
export class VxStatusBadge {
  /** A backend status name such as `Active`, `NoShow`, `PendingSignature`. */
  readonly status = input<string | null | undefined>(null);
  /** Overrides the tone derived from `status`. */
  readonly tone = input<StatusTone | null>(null);
  /** Overrides the label derived from `status`. */
  readonly label = input<string | null>(null);
  readonly icon = input<VxIconName | null>(null);

  protected readonly resolvedTone = computed(() => this.tone() ?? statusTone(this.status()));
  protected readonly text = computed(() => this.label() ?? statusLabel(this.status()));
}

/**
 * A dashboard metric.
 *
 * The number is the loudest thing in the tile; the label sits above it, the context below. A tile
 * that is still loading shows a shimmer in place of the number rather than a zero, because a zero
 * that later becomes 412 reads as a bug.
 */
@Component({
  selector: 'vx-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div class="vx-card vx-card-pad flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="vx-section-label">{{ label() }}</p>
        @if (loading()) {
          <div class="vx-skeleton mt-3 h-8 w-20"></div>
        } @else {
          <p class="mt-2 text-3xl font-semibold tracking-tight text-ink">{{ value() }}</p>
        }
        @if (context(); as line) {
          <p class="mt-1 truncate text-meta text-ink-muted">{{ line }}</p>
        }
      </div>
      <span
        class="flex size-11 flex-none items-center justify-center rounded-xl"
        [style.background]="'var(--vexto-' + accent() + '-soft, var(--vexto-primary-50))'"
        [style.color]="'var(--vexto-' + accent() + ', var(--vexto-primary))'"
      >
        <vx-icon [name]="icon()" [size]="22" />
      </span>
    </div>
  `,
})
export class VxStatCard {
  readonly label = input.required<string>();
  readonly value = input<string | number>('—');
  readonly context = input<string | null>(null);
  readonly icon = input.required<VxIconName>();
  /** Maps to the status token family used for the icon chip. */
  readonly accent = input<'primary' | 'success' | 'warning' | 'danger' | 'info'>('primary');
  readonly loading = input(false);
}
