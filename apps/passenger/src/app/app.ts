import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@vexto/ui';

@Component({
  selector: 'vexto-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  /**
   * Injected for its constructor, which resolves the stored preference and starts following the OS
   * theme. The inline script in `index.html` has already stamped the attribute to avoid a flash;
   * this is what keeps it correct afterwards, and what makes `system` mode live.
   */
  protected readonly theme = inject(ThemeService);
}
