import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import type { Observable } from 'rxjs';
import { VxIcon } from './icon/vx-icon';

/** One choice, in the shape every picker endpoint returns. */
export interface VxPickerOption {
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string | null;
}

/** How this picker asks the server for choices. `term` is empty on first open. */
export type VxPickerSearch = (term: string) => Observable<readonly VxPickerOption[]>;

/**
 * Choosing one record out of many, by typing.
 *
 * **This exists because a `<select>` was quietly lying.** Every picker endpoint in Vexto is a
 * server-side type-ahead — bounded at twenty by default, fifty at most, and searchable — but the
 * forms rendered the first page into a plain dropdown and stopped there. On a pilot database with
 * fifty-three routes that meant thirty-three of them could not be chosen at all, and nothing on
 * screen said so: the list simply ended. A form that cannot express a valid choice is worse than a
 * slow one, because the user concludes the record does not exist.
 *
 * So the term goes to the server, debounced, and the *server* decides what matches. The bound is
 * kept — the point of a picker is never to ship four thousand records to draw a dropdown — but the
 * bound is now over the search results rather than over the alphabet.
 *
 * **It is a real combobox for the keyboard**, not a div with a click handler: arrow keys move the
 * active option, Enter chooses it, Escape closes, and `aria-activedescendant` tells a screen reader
 * which option is current. A picker that only works with a mouse is a picker half the operators
 * cannot use.
 *
 * The caller supplies `search`, so `@vexto/ui` stays below the API client in the dependency graph
 * and this component never learns what an HTTP request is.
 */
@Component({
  selector: 'vx-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  host: {
    class: 'relative block',
    '(document:click)': 'closeIfOutside($event)',
  },
  template: `
    <div class="relative">
      <input
        [id]="inputId()"
        type="text"
        class="vx-input"
        [class.pe-9]="!showClear()"
        [class.pe-16]="showClear()"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="invalid() && errorId() ? errorId() : null"
        [attr.aria-controls]="inputId() + '-listbox'"
        [attr.aria-activedescendant]="open() && active() >= 0 ? inputId() + '-option-' + active() : null"
        [attr.placeholder]="placeholder()"
        [attr.disabled]="disabled() ? '' : null"
        [value]="text()"
        (focus)="openList()"
        (input)="onType($event)"
        (keydown.arrowdown)="move(1, $event)"
        (keydown.arrowup)="move(-1, $event)"
        (keydown.enter)="choose($event)"
        (keydown.escape)="close()"
      />

      @if (showClear()) {
        <!--
          A picker whose value is optional needs a way back to "none". Without one the only way to
          undo a filter is to reload the page, which people do — and then lose everything else they
          had set.
        -->
        <button
          type="button"
          class="absolute inset-y-0 end-8 flex items-center px-1 text-ink-muted"
          [attr.aria-label]="'Clear ' + (selected()?.label ?? 'selection')"
          (click)="clear($event)"
        >
          <vx-icon name="close" [size]="15" />
        </button>
      }

      <span class="pointer-events-none absolute inset-y-0 end-3 flex items-center text-ink-muted">
        @if (loading()) {
          <span class="vx-spinner size-4" aria-hidden="true"></span>
        } @else {
          <vx-icon name="chevron-down" [size]="16" />
        }
      </span>
    </div>

    @if (open()) {
      <div
        class="vx-card absolute z-40 mt-1 max-h-64 w-full overflow-y-auto py-1 shadow-pop"
        style="background: var(--vexto-surface-raised)"
        role="listbox"
        [id]="inputId() + '-listbox'"
      >
        @if (loading() && options().length === 0) {
          <p class="px-3.5 py-3 text-meta text-ink-muted">Searching…</p>
        } @else if (options().length === 0) {
          <!--
            The two reasons a picker is empty are different, and only one of them is the user's to
            fix. "Nothing matches Ahmed" is a prompt to try another spelling; "there is nothing to
            choose" means somebody has to go and create one first.
          -->
          <p class="px-3.5 py-3 text-meta text-ink-muted">
            {{ term() ? 'Nothing matches “' + term() + '”.' : emptyLabel() }}
          </p>
        } @else {
          @for (option of options(); track option.id; let index = $index) {
            <button
              type="button"
              role="option"
              [id]="inputId() + '-option-' + index"
              class="flex w-full flex-col items-start gap-0.5 px-3.5 py-2 text-start"
              [class.bg-surface-hover]="index === active()"
              [attr.aria-selected]="option.id === selectedId()"
              (mouseenter)="active.set(index)"
              (click)="select(option)"
            >
              <span class="truncate text-body text-ink">{{ option.label }}</span>
              @if (option.secondaryLabel) {
                <span class="truncate text-meta text-ink-muted">{{ option.secondaryLabel }}</span>
              }
            </button>
          }

          <!--
            Said out loud rather than left to be discovered. The list is bounded by the server, and a
            user who cannot see their record needs to know that typing more will find it — otherwise
            a truncated list reads exactly like a complete one.
          -->
          @if (options().length >= limit()) {
            <p class="border-t border-line-subtle px-3.5 py-2 text-meta text-ink-muted">
              Showing the first {{ options().length }}. Type to narrow the list.
            </p>
          }
        }
      </div>
    }
  `,
  styles: `
    .vx-spinner {
      border: 2px solid var(--vexto-border);
      border-top-color: var(--vexto-primary);
      border-radius: 9999px;
      animation: vx-picker-spin 0.7s linear infinite;
    }

    @keyframes vx-picker-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* A spinner that never stops is a distraction for somebody who set "reduce motion" deliberately. */
    @media (prefers-reduced-motion: reduce) {
      .vx-spinner {
        animation: none;
      }
    }
  `,
})
export class VxPicker {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Used for the input's id and for every generated `aria-` reference. */
  readonly inputId = input.required<string>();
  readonly search = input.required<VxPickerSearch>();
  readonly placeholder = input('Search…');
  /** Shown when the server returns nothing and nothing has been typed. */
  readonly emptyLabel = input('There is nothing to choose yet.');
  readonly disabled = input(false);

  /**
   * Whether the field currently fails validation. Sets `aria-invalid`, which the stylesheet already
   * draws for every input — so a picker and a text field fail looking the same, and the state is
   * announced rather than only coloured.
   */
  readonly invalid = input(false);

  /** The id of the element carrying the error message, so the input can point at it. */
  readonly errorId = input<string | null>(null);

  /**
   * Offers a clear button once something is chosen. Off by default: a required field with a clear
   * button invites a state the form will only refuse.
   */
  readonly clearable = input(false);

  /** The currently chosen option, so the input shows a label rather than an id. */
  readonly selected = input<VxPickerOption | null>(null);
  /** What the server was asked for, so the "type to narrow" hint is honest. */
  readonly limit = input(20);

  readonly chosen = output<VxPickerOption | null>();

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly options = signal<readonly VxPickerOption[]>([]);
  protected readonly term = signal('');
  protected readonly active = signal(-1);

  /** Null once the user starts typing again, so the box does not claim a stale choice. */
  private readonly typing = signal(false);

  protected readonly selectedId = computed(() => this.selected()?.id ?? null);

  protected readonly showClear = computed(
    () => this.clearable() && !this.disabled() && this.selected() !== null,
  );

  /** The chosen label while idle, and whatever is being typed while searching. */
  protected readonly text = computed(() =>
    this.typing() ? this.term() : (this.selected()?.label ?? ''),
  );

  private readonly queries = new Subject<string>();

  constructor() {
    this.queries
      .pipe(
        // Long enough that a name is typed rather than transmitted letter by letter, short enough
        // that it still feels like a type-ahead.
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loading.set(true);

          return this.search()(term);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (options) => {
          this.options.set(options);
          this.loading.set(false);
          this.active.set(options.length > 0 ? 0 : -1);
        },
        error: () => {
          this.options.set([]);
          this.loading.set(false);
        },
      });

    // A selection made elsewhere — an edit form loading its record — stops the box showing a stale
    // search term.
    effect(() => {
      this.selected();
      this.typing.set(false);
    });
  }

  protected openList(): void {
    if (this.disabled() || this.open()) {
      return;
    }

    this.open.set(true);

    // The first page is fetched on open rather than on load: most forms are abandoned, and most of
    // the rest touch one picker out of four.
    if (this.options().length === 0) {
      this.queries.next(this.term());
    }
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.typing.set(true);
    this.term.set(value);
    this.open.set(true);
    this.queries.next(value);
  }

  protected move(delta: number, event: Event): void {
    event.preventDefault();
    this.openList();

    const count = this.options().length;

    if (count === 0) {
      return;
    }

    this.active.update((index) => (index + delta + count) % count);
  }

  protected choose(event: Event): void {
    event.preventDefault();

    const option = this.options()[this.active()];

    if (option) {
      this.select(option);
    }
  }

  /**
   * Back to nothing chosen. Emits null so the host clears its own model too — a picker that only
   * cleared its own display would leave the form still holding the old id.
   */
  protected clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.typing.set(false);
    this.term.set('');
    this.close();
    this.chosen.emit(null);
  }

  protected select(option: VxPickerOption): void {
    this.typing.set(false);
    this.term.set('');
    this.close();
    this.chosen.emit(option);
  }

  protected close(): void {
    this.open.set(false);
    this.typing.set(false);
  }

  /**
   * Closes on a click anywhere outside.
   *
   * Containment rather than swallowing clicks inside the panel: a div that stops propagation needs
   * a click handler, and a click handler on a non-interactive element is an accessibility failure.
   */
  protected closeIfOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
