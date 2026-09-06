import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PermissionService } from '@vexto/permissions';
import { VxIcon } from '@vexto/ui';
import type { NavSection } from './navigation';

/**
 * The operator portal's primary navigation.
 *
 * Dark on a light page: the chrome is visibly not content, which is the single strongest thing
 * separating Vexto from a default admin template. Proportions (a 268px rail, 90px collapsed,
 * section headings above grouped items) follow the reference portal because they work.
 *
 * Sections whose every item is hidden by permissions disappear entirely — a heading over nothing
 * looks like a bug.
 */
@Component({
  selector: 'vx-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, VxIcon],
  template: `
    <aside
      class="fixed inset-y-0 left-0 z-40 flex flex-col transition-transform duration-200 ease-out xl:translate-x-0"
      style="background: var(--vexto-nav-bg); border-right: 1px solid var(--vexto-nav-border)"
      [style.width.px]="collapsed() ? 76 : 268"
      [class.-translate-x-full]="!mobileOpen()"
      [class.translate-x-0]="mobileOpen()"
    >
      <div class="flex h-16 flex-none items-center gap-2.5 px-5">
        <a routerLink="/" class="flex items-center gap-2.5" aria-label="Vexto home">
          <span
            class="flex size-9 flex-none items-center justify-center rounded-xl text-base font-bold text-white"
            style="background: linear-gradient(135deg, var(--vexto-primary) 0%, var(--vexto-primary-active) 100%)"
            >V</span
          >
          @if (!collapsed()) {
            <span class="text-[0.95rem] font-semibold tracking-tight text-white">Vexto</span>
          }
        </a>
      </div>

      <nav class="vx-no-scrollbar flex-1 overflow-y-auto px-3 pb-6" aria-label="Main">
        @for (section of visibleSections(); track section.label ?? $index) {
          <div class="mb-5">
            @if (section.label && !collapsed()) {
              <p
                class="vx-section-label mb-2 px-3"
                style="color: var(--vexto-nav-section)"
              >
                {{ section.label }}
              </p>
            } @else if (section.label && collapsed()) {
              <div class="mx-3 mb-3 border-t" style="border-color: var(--vexto-nav-border)"></div>
            }
            <ul class="flex flex-col gap-0.5">
              @for (item of section.items; track item.link) {
                <li>
                  <a
                    class="vx-nav-item"
                    [class.justify-center]="collapsed()"
                    [routerLink]="item.link"
                    routerLinkActive="vx-nav-item-active"
                    [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                    [attr.title]="collapsed() ? item.label : null"
                    (click)="navigated.emit()"
                  >
                    <vx-icon class="vx-nav-icon" [name]="item.icon" [size]="19" />
                    @if (!collapsed()) {
                      <span class="truncate">{{ item.label }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
          </div>
        }
      </nav>

      <div class="flex-none border-t px-3 py-3" style="border-color: var(--vexto-nav-border)">
        <button
          type="button"
          class="vx-nav-item"
          [class.justify-center]="collapsed()"
          [attr.aria-label]="collapsed() ? 'Expand navigation' : 'Collapse navigation'"
          (click)="collapseToggled.emit()"
        >
          <vx-icon
            class="vx-nav-icon"
            [name]="collapsed() ? 'chevron-right' : 'chevron-left'"
            [size]="19"
          />
          @if (!collapsed()) {
            <span>Collapse</span>
          }
        </button>
      </div>
    </aside>
  `,
})
export class VxSidebar {
  private readonly permissions = inject(PermissionService);

  readonly sections = input.required<readonly NavSection[]>();
  readonly collapsed = input(false);
  readonly mobileOpen = input(false);
  readonly collapseToggled = output<void>();
  readonly navigated = output<void>();

  protected readonly visibleSections = computed(() =>
    this.sections()
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.permissions?.length || this.permissions.hasAny(...item.permissions),
        ),
      }))
      .filter((section) => section.items.length > 0),
  );
}
