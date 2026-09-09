import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AttentionItem } from '@vexto/models';
import { VxIcon, VxSectionCard, VxSkeleton, type VxIconName } from '@vexto/ui';

/** Which icon and tone each condition is drawn with. Keyed on the server's stable `kind`. */
const STYLES: Readonly<Record<string, { icon: VxIconName; tone: string }>> = {
  TripsWithoutDriver: { icon: 'drivers', tone: 'warning' },
  TripsWithoutVehicle: { icon: 'vehicle', tone: 'warning' },
  BlockedPassengers: { icon: 'ban', tone: 'danger' },
  VehiclesInMaintenance: { icon: 'wrench', tone: 'warning' },
  LicencesExpiring: { icon: 'shield', tone: 'warning' },
};

const FALLBACK = { icon: 'alert' as VxIconName, tone: 'warning' };

/**
 * The things somebody has to do something about today.
 *
 * **Counted by the server, listed here.** The browser could work most of this out by fetching the
 * passenger list, the fleet and every upcoming trip and counting them — which is precisely the
 * front-end aggregation this panel exists instead of: it grows with the operator, it needs
 * permissions the panel does not otherwise require, and two screens doing it would drift.
 *
 * **Every row is a link.** An item nobody can act on is a worry, not a task, so each one carries the
 * filtered list it came from — "2 upcoming trips have no driver assigned" goes to those two trips,
 * not to the trip board.
 *
 * **Nothing wrong is a real answer, and it is drawn as one.** The panel does not list green ticks
 * for conditions that are not happening: a "needs attention" list that mostly says things are fine
 * teaches people to stop reading it.
 */
@Component({
  selector: 'vexto-attention-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxIcon, VxSectionCard, VxSkeleton],
  template: `
    <vx-section-card
      title="Needs attention"
      description="Conditions that stop a trip running as planned."
    >
      @if (loading()) {
        <div class="flex flex-col gap-3">
          @for (row of [0, 1]; track row) {
            <vx-skeleton height="2.5rem" />
          }
        </div>
      } @else if (items().length === 0) {
        <p class="flex items-center gap-2 text-body text-ink-secondary">
          <vx-icon name="check-circle" [size]="18" style="color: var(--vexto-success)" />
          Nothing needs attention right now.
        </p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (item of items(); track item.kind) {
            <li>
              <a
                class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                style="background: var(--vexto-surface-muted)"
                [routerLink]="path(item)"
                [queryParams]="query(item)"
              >
                <span
                  class="flex size-9 flex-none items-center justify-center rounded-lg"
                  [style.background]="'var(--vexto-' + style(item).tone + '-soft)'"
                  [style.color]="
                    'var(--vexto-' + style(item).tone + '-text, var(--vexto-' + style(item).tone + '))'
                  "
                  aria-hidden="true"
                >
                  <vx-icon [name]="style(item).icon" [size]="18" />
                </span>

                <span class="min-w-0 flex-1 truncate text-body text-ink">{{ item.message }}</span>

                <vx-icon name="chevron-right" [size]="16" class="flex-none text-ink-muted" />
              </a>
            </li>
          }
        </ul>
      }
    </vx-section-card>
  `,
})
export class AttentionPanel {
  readonly items = input.required<readonly AttentionItem[]>();
  readonly loading = input(false);

  protected style(item: AttentionItem): { icon: VxIconName; tone: string } {
    return STYLES[item.kind] ?? FALLBACK;
  }

  /**
   * The route half of the server's link.
   *
   * The server sends an app-relative path with a query string; the router wants them apart. Split
   * here rather than asking the API to send two fields, because "where does this go" is one fact
   * and splitting it in the contract would let the halves disagree.
   */
  protected path(item: AttentionItem): string {
    return item.link.split('?')[0];
  }

  protected query(item: AttentionItem): Record<string, string> {
    const query = item.link.split('?')[1];

    if (!query) {
      return {};
    }

    return Object.fromEntries(new URLSearchParams(query).entries());
  }
}
