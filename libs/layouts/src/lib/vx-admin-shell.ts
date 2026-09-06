import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VxConfirmHost, VxToastHost } from '@vexto/ui';
import type { NavSection } from './navigation';
import { VxSidebar } from './vx-sidebar';
import { VxTopbar } from './vx-topbar';

/**
 * The desktop-first operator shell: rail, top bar, content.
 *
 * Below `xl` the rail becomes an overlay drawer rather than shrinking — a dispatcher on a laptop
 * needs the full page width for a trips table, and a half-width rail steals it.
 */
@Component({
  selector: 'vx-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, VxSidebar, VxTopbar, VxToastHost, VxConfirmHost],
  template: `
    <div class="min-h-screen bg-bg">
      <vx-sidebar
        [sections]="sections()"
        [collapsed]="collapsed()"
        [mobileOpen]="mobileOpen()"
        (collapseToggled)="collapsed.set(!collapsed())"
        (navigated)="mobileOpen.set(false)"
      />

      @if (mobileOpen()) {
        <div
          class="fixed inset-0 z-30 xl:hidden"
          style="background: var(--vexto-overlay)"
          role="presentation"
          (click)="mobileOpen.set(false)"
        ></div>
      }

      <div
        class="flex min-h-screen flex-col transition-[padding] duration-200 ease-out xl:pl-(--rail)"
        [style.--rail]="collapsed() ? '76px' : '268px'"
      >
        <vx-topbar (menuToggled)="mobileOpen.set(!mobileOpen())" />

        <main class="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>

      <vx-toast-host />
      <vx-confirm-host />
    </div>
  `,
})
export class VxAdminShell {
  readonly sections = input.required<readonly NavSection[]>();

  protected readonly collapsed = signal(false);
  protected readonly mobileOpen = signal(false);
}
