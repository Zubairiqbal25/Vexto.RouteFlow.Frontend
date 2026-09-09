import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { PermissionService } from '@vexto/permissions';
import { VxIcon } from '@vexto/ui';
import type { NavSection } from './navigation';

interface Command {
  readonly label: string;
  readonly group: string;
  readonly link: string;
  readonly icon: string;
  /** Sent as query parameters, which is how a quick action says "create" rather than "go to". */
  readonly params?: Record<string, string>;
}

/**
 * The things somebody can *do* from the palette, as opposed to screens they can go to.
 *
 * Each one lands on the list page it belongs to with the create form already open, via the `new`
 * query parameter. That keeps the palette free of any knowledge about forms — it navigates, and the
 * destination decides what an arrival carrying that parameter means.
 *
 * Every action names the permission the API would enforce, so the palette never offers a create the
 * server would refuse.
 */
const QUICK_ACTIONS: readonly (Command & { readonly permission: string })[] = [
  {
    label: 'Create passenger',
    group: 'Quick actions',
    link: '/passengers',
    params: { new: '1' },
    icon: 'passengers',
    permission: 'Passengers.Manage',
  },
  {
    label: 'Create driver',
    group: 'Quick actions',
    link: '/drivers',
    params: { new: '1' },
    icon: 'drivers',
    permission: 'Drivers.Manage',
  },
  {
    label: 'Create vehicle',
    group: 'Quick actions',
    link: '/vehicles',
    params: { new: '1' },
    icon: 'vehicle',
    permission: 'Fleet.Manage',
  },
  {
    label: 'Create route',
    group: 'Quick actions',
    link: '/routes',
    params: { new: '1' },
    icon: 'routes',
    permission: 'Routes.Manage',
  },
  {
    label: 'Generate trips',
    group: 'Quick actions',
    link: '/routes',
    icon: 'trips',
    permission: 'Trips.Manage',
  },
];

/** How many recently visited screens the palette offers back. */
const RECENT_LIMIT = 4;

/**
 * Ctrl/⌘-K navigation.
 *
 * **Deliberately screens and actions only — never entity search.** Vexto has no cross-entity search
 * endpoint, and a palette that silently searched nothing while looking like it searched everything
 * would be worse than no palette: people would type a passenger's name, get nothing, and conclude
 * the passenger is not in the system. It offers the screens the signed-in user can reach, the few
 * creates they are permitted to perform, and the screens they were just on — and is structured so
 * that entity results can be appended as one more group the day a search endpoint exists.
 *
 * Permissions are honoured, so a dispatcher cannot jump to a page the sidebar hides from them and
 * the API would refuse anyway.
 */
@Component({
  selector: 'vx-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
        <!-- The backdrop is a real button so it is reachable and announced, rather than a div with
             a click handler. Escape closes the palette too; this is the pointer path. -->
        <button
          type="button"
          class="absolute inset-0 h-full w-full cursor-default"
          style="background: var(--vexto-overlay)"
          aria-label="Close command palette"
          (click)="close()"
        ></button>

        <div
          class="vx-card relative w-full max-w-xl overflow-hidden shadow-pop"
          style="background: var(--vexto-surface-raised)"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div class="relative border-b border-line-subtle">
            <span
              class="pointer-events-none absolute inset-y-0 start-4 flex items-center text-ink-muted"
            >
              <vx-icon name="search" [size]="17" />
            </span>
            <input
              #box
              type="text"
              class="w-full border-0 bg-transparent py-3.5 ps-11 pe-4 text-body text-ink
                     outline-none placeholder:text-ink-muted"
              placeholder="Jump to a screen, or start something…"
              aria-label="Jump to a screen, or start something"
              autocomplete="off"
              [value]="term()"
              (input)="onInput($event)"
              (keydown.arrowdown)="move(1, $event)"
              (keydown.arrowup)="move(-1, $event)"
              (keydown.enter)="run($event)"
            />
          </div>

          <div class="vx-scroll max-h-[22rem] overflow-y-auto py-2">
            @if (results().length === 0) {
              <p class="px-4 py-8 text-center text-body text-ink-muted">
                Nothing matches “{{ term() }}”.
              </p>
            } @else {
              @for (group of grouped(); track group.name) {
                <p class="vx-section-label px-4 pb-1 pt-2">{{ group.name }}</p>
                @for (command of group.items; track command.label) {
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-start"
                    [class.bg-surface-hover]="results()[active()] === command"
                    (mouseenter)="active.set(indexOf(command))"
                    (click)="go(command)"
                  >
                    <vx-icon [name]="$any(command.icon)" [size]="16" />
                    <span class="flex-1 truncate text-body text-ink">{{ command.label }}</span>
                    @if (results()[active()] === command) {
                      <span class="text-[0.6875rem] text-ink-muted">↵</span>
                    }
                  </button>
                }
              }
            }
          </div>

          <div
            class="flex items-center gap-4 border-t border-line-subtle px-4 py-2.5 text-[0.6875rem] text-ink-muted"
          >
            <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to open</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    kbd {
      display: inline-block;
      min-width: 1.25rem;
      padding: 0 0.25rem;
      border: 1px solid var(--vexto-border);
      border-radius: 4px;
      background: var(--vexto-surface-muted);
      font-family: inherit;
      font-size: 0.6875rem;
      text-align: center;
    }
  `,
})
export class VxCommandPalette {
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  readonly sections = input.required<readonly NavSection[]>();

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly active = signal(0);

  /** Visited screen links, most recent first. Session-scoped; see `recent`. */
  private readonly history = signal<readonly string[]>([]);
  private readonly currentUrl = signal('');

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }

      // The path only: `/routes?new=1` and `/routes` are the same screen, and recording both would
      // fill the recent list with one destination.
      const path = event.urlAfterRedirects.split('?')[0] ?? '';

      this.currentUrl.set(path);
      this.history.update((visited) => [path, ...visited.filter((link) => link !== path)].slice(0, 12));
    });
  }

  /** Screens, from the same navigation model the sidebar renders. */
  private readonly screens = computed<readonly Command[]>(() =>
    this.sections().flatMap((section) =>
      section.items
        .filter((item) => !item.permissions?.length || this.permissions.hasAny(...item.permissions))
        .map((item) => ({
          label: item.label,
          group: section.label ?? 'Navigate',
          link: item.link,
          icon: item.icon as string,
        })),
    ),
  );

  /** Actions the signed-in user is actually allowed to perform. */
  private readonly quickActions = computed<readonly Command[]>(() =>
    QUICK_ACTIONS.filter((action) => this.permissions.has(action.permission)).map(
      ({ permission: _permission, ...command }) => command,
    ),
  );

  /**
   * The last few screens visited, most recent first.
   *
   * Held in memory for the session rather than persisted: a palette that offers yesterday's screens
   * on a fresh morning is offering history, not shortcuts. The current screen is excluded — the one
   * page nobody needs a shortcut to is the one they are looking at.
   */
  private readonly recent = computed<readonly Command[]>(() => {
    const visited = this.history();
    const current = this.currentUrl();
    const screens = this.screens();

    return visited
      .filter((link) => link !== current)
      .map((link) => screens.find((screen) => screen.link === link))
      .filter((screen): screen is Command => screen !== undefined)
      .slice(0, RECENT_LIMIT)
      .map((screen) => ({ ...screen, group: 'Recent' }));
  });

  private readonly commands = computed<readonly Command[]>(() => [
    ...this.recent(),
    ...this.quickActions(),
    ...this.screens(),
  ]);

  protected readonly results = computed(() => {
    const term = this.term().trim().toLowerCase();

    // Recents are an empty-box convenience. Once somebody is typing they are looking for a specific
    // thing, and listing it twice — once under Recent, once under its section — is just noise.
    if (!term) {
      return this.commands();
    }

    const searchable = [...this.quickActions(), ...this.screens()];

    // Prefix matches first: typing "pa" should offer Passengers before Payments only because one
    // starts with it, which is what a person expects from a jump box.
    const matches = searchable.filter((command) => command.label.toLowerCase().includes(term));

    return [...matches].sort((left, right) => {
      const leftStarts = left.label.toLowerCase().startsWith(term) ? 0 : 1;
      const rightStarts = right.label.toLowerCase().startsWith(term) ? 0 : 1;

      return leftStarts - rightStarts;
    });
  });

  protected readonly grouped = computed(() => {
    const groups = new Map<string, Command[]>();

    for (const command of this.results()) {
      const bucket = groups.get(command.group) ?? [];
      bucket.push(command);
      groups.set(command.group, bucket);
    }

    return [...groups].map(([name, items]) => ({ name, items }));
  });

  protected indexOf(command: Command): number {
    return this.results().indexOf(command);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.toggle();

      return;
    }

    if (event.key === 'Escape' && this.open()) {
      this.close();
    }
  }

  /** Opened from the top bar as well as from the keyboard, so this is part of the public API. */
  toggle(): void {
    this.open.update((value) => !value);
    this.term.set('');
    this.active.set(0);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onInput(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected move(delta: number, event: Event): void {
    event.preventDefault();

    const count = this.results().length;

    if (count === 0) {
      return;
    }

    // Wraps, so holding Down does not stick at the bottom of a short list.
    this.active.update((index) => (index + delta + count) % count);
  }

  protected run(event: Event): void {
    event.preventDefault();

    const command = this.results()[this.active()];

    if (command) {
      this.go(command);
    }
  }

  protected go(command: Command): void {
    this.close();
    void this.router.navigate([command.link], { queryParams: command.params });
  }
}
