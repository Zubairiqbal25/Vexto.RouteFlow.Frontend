import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { VxIcon, type VxIconName } from './icon/vx-icon';

/** What the user chose. `system` follows the operating system and keeps following it. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually on screen. `system` has already been resolved to one of these. */
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'vexto.theme';

/**
 * The one place the product decides whether it is light or dark.
 *
 * **The attribute is always explicit.** `system` is resolved here, in JavaScript, and the result is
 * stamped on `<html>` as `data-theme="light"` or `data-theme="dark"`. The stylesheet therefore has
 * a single dark block hanging off one selector, with no `prefers-color-scheme` rule of its own —
 * which is what stops the CSS and the toggle ever disagreeing about what is showing.
 *
 * **System mode is live.** The media query is subscribed to, not read once at start-up, so moving
 * the OS from light to dark repaints Vexto immediately. No reload, and no "click the toggle twice
 * to resync".
 *
 * The preference is stored per application (`vexto.theme`, in each app's own origin/storage), which
 * is the same boundary the session already uses: a driver's tablet and a dispatcher's laptop are
 * different devices with different lighting, and one of them being dark says nothing about the
 * other.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly systemDark = signal(false);
  private readonly preferenceState = signal<ThemePreference>('system');

  /** What the user chose, including `system`. Bind the toggle to this. */
  readonly preference = this.preferenceState.asReadonly();

  /** What is actually rendered. Read this when a component genuinely needs to branch. */
  readonly effective = computed<EffectiveTheme>(() =>
    this.preferenceState() === 'system'
      ? this.systemDark()
        ? 'dark'
        : 'light'
      : (this.preferenceState() as EffectiveTheme),
  );

  readonly isDark = computed(() => this.effective() === 'dark');

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

    this.systemDark.set(media?.matches ?? false);
    this.preferenceState.set(this.read());

    // Live, for as long as the app is open. Not removed: the service is root-provided and outlives
    // every component, so there is nothing to clean up and a listener that stopped would leave
    // system mode quietly stuck on whatever it was at start-up.
    media?.addEventListener?.('change', (event) => {
      this.systemDark.set(event.matches);

      if (this.preferenceState() === 'system') {
        this.apply(false);
      }
    });

    // No transition class on the first paint. The page has not been drawn yet, so there is nothing
    // to animate from, and doing it anyway makes a cold load flash.
    this.apply(false);
  }

  set(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    this.write(preference);
    this.apply(true);
  }

  /**
   * Steps light → dark → system → light.
   *
   * Three states in one control rather than a checkbox, because `system` is a real answer that most
   * people want and a two-state toggle cannot express: a laptop that dims itself in the evening
   * should take Vexto with it.
   */
  cycle(): void {
    const next: Record<ThemePreference, ThemePreference> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };

    this.set(next[this.preferenceState()]);
  }

  private apply(animate: boolean): void {
    const root = this.document.documentElement;
    const theme = this.effective();

    if (root.getAttribute('data-theme') === theme) {
      return;
    }

    if (!animate) {
      root.setAttribute('data-theme', theme);
      return;
    }

    // The transition is scoped to the switch itself and removed afterwards. A permanent global
    // colour transition makes every hover in the product feel a frame late.
    root.classList.add('vexto-theme-switching');
    root.setAttribute('data-theme', theme);

    this.document.defaultView?.setTimeout(
      () => root.classList.remove('vexto-theme-switching'),
      260,
    );
  }

  private read(): ThemePreference {
    try {
      const stored = this.document.defaultView?.localStorage?.getItem(STORAGE_KEY);

      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    } catch {
      // Private browsing, or storage blocked by policy. Following the OS is the right default when
      // we cannot remember a choice, and a theme is never worth failing a page load over.
      return 'system';
    }
  }

  private write(preference: ThemePreference): void {
    try {
      this.document.defaultView?.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
      // As above: the preference simply will not survive a reload.
    }
  }
}

/**
 * The theme control.
 *
 * A single button that steps through the three states and names the *current* one, rather than a
 * dropdown: it is used rarely, it needs no explanation, and a menu for three mutually exclusive
 * values is more chrome than the choice deserves. The accessible name says what is active and what
 * pressing it will do, because an icon alone cannot distinguish "dark" from "following a dark OS".
 */
@Component({
  selector: 'vx-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <button
      type="button"
      class="vx-btn vx-btn-ghost vx-btn-icon"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="theme.cycle()"
    >
      <vx-icon [name]="icon()" [size]="18" />
    </button>
  `,
})
export class VxThemeToggle {
  protected readonly theme = inject(ThemeService);

  protected readonly icon = computed<VxIconName>(() => {
    const icons = { light: 'sun', dark: 'moon', system: 'monitor' } as const;

    return icons[this.theme.preference()];
  });

  protected readonly label = computed(() => {
    const next = { light: 'dark', dark: 'system', system: 'light' } as const;

    return `Theme: ${this.theme.preference()}. Switch to ${next[this.theme.preference()]}.`;
  });
}
