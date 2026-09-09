import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VxConfirmHost, VxToastHost } from '@vexto/ui';
import { VxCommandPalette } from './vx-command-palette';
import type { NavSection } from './navigation';
import { VxSidebar } from './vx-sidebar';
import { VxSupportBanner } from './vx-support-banner';
import { VxTopbar } from './vx-topbar';

const COLLAPSE_KEY = 'vexto.sidebarCollapsed';

/**
 * The desktop-first operator shell: rail, top bar, content.
 *
 * Below `xl` the rail becomes an overlay drawer rather than shrinking — a dispatcher on a laptop
 * needs the full page width for a trips table, and a half-width rail steals it.
 *
 * The collapsed state is remembered. Somebody who works on a 1366-wide laptop collapses it once and
 * means it; making them do so on every page load is the kind of small friction that makes a product
 * feel unfinished.
 */
@Component({
  selector: 'vx-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    VxSidebar,
    VxSupportBanner,
    VxTopbar,
    VxToastHost,
    VxConfirmHost,
    VxCommandPalette,
  ],
  template: `
    <div class="min-h-screen bg-bg">
      <vx-sidebar
        [sections]="sections()"
        [collapsed]="collapsed()"
        [mobileOpen]="mobileOpen()"
        (collapseToggled)="toggleCollapsed()"
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
        class="flex min-h-screen flex-col transition-[padding] duration-200 ease-out xl:ps-(--rail)"
        [style.--rail]="collapsed() ? '76px' : '268px'"
      >
        <!-- Above the top bar and outside the scroll container, so it cannot be scrolled away
             while a support session is in progress. -->
        <vx-support-banner />

        <vx-topbar
          (menuToggled)="mobileOpen.set(!mobileOpen())"
          (paletteRequested)="palette.toggle()"
        />

        <main class="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>

      <vx-command-palette #palette [sections]="sections()" />
      <vx-toast-host />
      <vx-confirm-host />
    </div>
  `,
})
export class VxAdminShell {
  private readonly document = inject(DOCUMENT);

  readonly sections = input.required<readonly NavSection[]>();

  protected readonly collapsed = signal(this.readCollapsed());
  protected readonly mobileOpen = signal(false);

  protected toggleCollapsed(): void {
    this.collapsed.update((value) => !value);

    try {
      this.document.defaultView?.localStorage?.setItem(COLLAPSE_KEY, String(this.collapsed()));
    } catch {
      // The rail simply reopens on the next load.
    }
  }

  private readCollapsed(): boolean {
    try {
      return this.document.defaultView?.localStorage?.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
