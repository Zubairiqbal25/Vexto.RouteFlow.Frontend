import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { VxIcon } from './icon/vx-icon';

/**
 * A modal dialog, or a right-hand drawer when `variant` is `drawer`.
 *
 * Quick CRUD belongs in one of these; anything with sections and more than about eight fields
 * belongs on its own page. Making every action a modal is how forms end up scrolling inside a
 * 400-pixel box.
 *
 * Focus is trapped and restored by the CDK, Escape closes, and the backdrop is inert to clicks that
 * started inside the panel — so dragging a text selection out of the dialog does not dismiss it.
 */
@Component({
  selector: 'vx-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, VxIcon],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex"
        [class.items-center]="variant() === 'modal'"
        [class.justify-center]="variant() === 'modal'"
        [class.justify-end]="variant() === 'drawer'"
        [class.p-4]="variant() === 'modal'"
        role="presentation"
      >
        <div
          class="absolute inset-0"
          style="background: var(--vexto-overlay)"
          (mousedown)="dismiss()"
        ></div>

        <div
          class="relative flex w-full flex-col bg-surface shadow-pop"
          [class]="panelClass()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
        >
          <header class="flex items-start justify-between gap-4 px-6 py-5">
            <div>
              <h2 class="text-base font-semibold text-ink">{{ title() }}</h2>
              @if (description(); as text) {
                <p class="mt-1 text-meta text-ink-muted">{{ text }}</p>
              }
            </div>
            <button
              type="button"
              class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon"
              aria-label="Close"
              (click)="dismiss()"
            >
              <vx-icon name="close" [size]="18" />
            </button>
          </header>

          <div class="vx-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            <ng-content />
          </div>

          <footer
            class="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-6 py-4"
          >
            <ng-content select="[footer]" />
          </footer>
        </div>
      </div>
    }
  `,
})
export class VxModal {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly variant = input<'modal' | 'drawer'>('modal');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Set false while saving, so a stray Escape cannot abandon an in-flight request. */
  readonly dismissable = input(true);
  readonly closed = output<void>();

  /** Modal: a centred, rounded card. Drawer: a full-height panel pinned to the trailing edge. */
  protected readonly panelClass = computed(() => {
    if (this.variant() === 'drawer') {
      return 'h-full max-w-md';
    }

    const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[this.size()];

    return `rounded-2xl max-h-[90vh] ${width}`;
  });

  constructor() {
    // The page behind a modal must not scroll; a drawer over a long list is otherwise disorienting.
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }

      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  protected dismiss(): void {
    if (this.dismissable()) {
      this.closed.emit();
    }
  }

  protected onEscape(): void {
    if (this.open()) {
      this.dismiss();
    }
  }
}

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

/**
 * "Are you sure?" without a dozen bespoke dialogs.
 *
 * `await confirm.ask({...})` resolves true or false. One `<vx-confirm-host/>` in each app shell
 * renders whatever is pending.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly pending = signal<ConfirmRequest | null>(null);
  private resolver: ((confirmed: boolean) => void) | null = null;

  readonly request = this.pending.asReadonly();

  ask(request: ConfirmRequest): Promise<boolean> {
    this.settle(false);
    this.pending.set(request);

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  settle(confirmed: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.pending.set(null);
    resolve?.(confirmed);
  }
}

@Component({
  selector: 'vx-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxModal],
  template: `
    @if (request(); as pending) {
      <vx-modal
        [open]="true"
        size="sm"
        [title]="pending.title"
        (closed)="answer(false)"
      >
        <p class="pb-4 text-body text-ink-secondary">{{ pending.message }}</p>
        <button type="button" footer class="vx-btn vx-btn-secondary" (click)="answer(false)">
          {{ pending.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          type="button"
          footer
          class="vx-btn"
          [class.vx-btn-danger]="pending.danger"
          [class.vx-btn-primary]="!pending.danger"
          (click)="answer(true)"
        >
          {{ pending.confirmLabel ?? 'Confirm' }}
        </button>
      </vx-modal>
    }
  `,
})
export class VxConfirmHost {
  private readonly service = inject(ConfirmService);

  protected readonly request = this.service.request;

  protected answer(confirmed: boolean): void {
    this.service.settle(confirmed);
  }
}

export interface Toast {
  readonly id: number;
  readonly tone: 'success' | 'danger' | 'info';
  readonly message: string;
}

/**
 * Transient confirmation of an action that succeeded or failed.
 *
 * Deliberately minimal: toasts acknowledge, they do not explain. Anything a user must read
 * carefully belongs on the page, not in a message that disappears after four seconds.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('danger', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  private push(tone: Toast['tone'], message: string): void {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, tone, message }]);
    setTimeout(() => this.dismiss(id), tone === 'danger' ? 7000 : 4000);
  }
}

@Component({
  selector: 'vx-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      @for (toast of toasts(); track toast.id) {
        <div
          class="vx-card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 shadow-pop"
        >
          <span class="mt-0.5 flex-none" [class]="'vx-tone-' + toast.tone + ' vx-badge !p-1'">
            <vx-icon [name]="iconFor(toast.tone)" [size]="14" [strokeWidth]="2.2" />
          </span>
          <p class="flex-1 text-body text-ink-secondary">{{ toast.message }}</p>
          <button
            type="button"
            class="vx-btn vx-btn-ghost vx-btn-sm vx-btn-icon -mt-1"
            aria-label="Dismiss"
            (click)="dismiss(toast.id)"
          >
            <vx-icon name="close" [size]="15" />
          </button>
        </div>
      }
    </div>
  `,
})
export class VxToastHost {
  private readonly service = inject(ToastService);

  protected readonly toasts = this.service.toasts;

  protected iconFor(tone: Toast['tone']): 'check-circle' | 'alert' | 'info' {
    return tone === 'success' ? 'check-circle' : tone === 'danger' ? 'alert' : 'info';
  }

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}

