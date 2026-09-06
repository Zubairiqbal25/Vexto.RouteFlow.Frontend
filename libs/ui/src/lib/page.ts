import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VxIcon } from './icon/vx-icon';

export interface VxBreadcrumb {
  readonly label: string;
  readonly link?: string;
}

/**
 * The heading every operator page starts with.
 *
 * Having one component means the gap above the title, the size of the title and the position of the
 * primary action are identical on all fifteen screens — which is most of what "looks like one
 * product" actually means.
 */
@Component({
  selector: 'vx-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxIcon],
  template: `
    <header class="mb-6">
      @if (breadcrumbs().length > 0) {
        <nav class="mb-2 flex items-center gap-1.5 text-meta text-ink-muted" aria-label="Breadcrumb">
          @for (crumb of breadcrumbs(); track crumb.label; let last = $last) {
            @if (crumb.link && !last) {
              <a [routerLink]="crumb.link" class="hover:text-ink">{{ crumb.label }}</a>
            } @else {
              <span [class.text-ink-secondary]="last">{{ crumb.label }}</span>
            }
            @if (!last) {
              <vx-icon name="chevron-right" [size]="13" />
            }
          }
        </nav>
      }

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{{ title() }}</h1>
          @if (description(); as text) {
            <p class="mt-1 max-w-2xl text-body text-ink-muted">{{ text }}</p>
          }
        </div>
        <div class="flex flex-none items-center gap-2">
          <ng-content select="[actions]" />
        </div>
      </div>
    </header>
  `,
})
export class VxPageHeader {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly breadcrumbs = input<VxBreadcrumb[]>([]);
}

/**
 * A titled panel inside a page — the unit route detail, trip detail and the forms are built from.
 */
@Component({
  selector: 'vx-section-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="vx-card overflow-hidden">
      @if (title()) {
        <div class="vx-card-header">
          <div>
            <h2 class="vx-card-title">{{ title() }}</h2>
            @if (description(); as text) {
              <p class="mt-0.5 text-meta text-ink-muted">{{ text }}</p>
            }
          </div>
          <ng-content select="[header-actions]" />
        </div>
      }
      <div [class.vx-card-pad]="padded()">
        <ng-content />
      </div>
    </section>
  `,
})
export class VxSectionCard {
  readonly title = input<string | null>(null);
  readonly description = input<string | null>(null);
  /** Tables set this false so rows reach the card edge. */
  readonly padded = input(true);
}
