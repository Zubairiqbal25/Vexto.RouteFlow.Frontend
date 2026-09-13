import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChildren,
} from '@angular/core';

/**
 * A one-time code, typed one digit per box.
 *
 * One component rather than six inputs wired by hand, because the behaviour people expect of these
 * boxes is subtle and has to be right everywhere: typing advances, backspace on an empty box goes
 * back, arrow keys move, and pasting the whole code from an email fills every box at once. Get any
 * of those wrong and the person retypes a code they can see on screen.
 *
 * The boxes are real `<input>`s, so a screen reader reads each as "Digit 1 of 6" and a phone opens
 * a numeric keypad. `autocomplete="one-time-code"` lets iOS and Android offer the code straight
 * from the message that delivered it.
 *
 * The value is a `model`: the parent reads it as one string, and may clear it to reset the boxes.
 * `completed` fires the moment the last digit lands so a form can submit without a second tap.
 */
@Component({
  selector: 'vx-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    '[attr.aria-label]': 'label()',
    '[attr.aria-invalid]': 'invalid() ? "true" : null',
    '[attr.aria-busy]': 'disabled() ? "true" : null',
    class: 'vx-otp',
    '[class.vx-otp-invalid]': 'invalid()',
    '[class.vx-otp-disabled]': 'disabled()',
    '[class.vx-otp-large]': 'size() === "large"',
  }
,
  template: `
    @for (index of slots(); track index) {
      <input
        #box
        class="vx-otp-box"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="1"
        [autocomplete]="index === 0 ? 'one-time-code' : 'off'"
        [attr.aria-label]="'Digit ' + (index + 1) + ' of ' + length()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [disabled]="disabled()"
        [value]="digits()[index]"
        (input)="onInput(index, $event)"
        (keydown)="onKeydown(index, $event)"
        (paste)="onPaste(index, $event)"
        (focus)="onFocus($event)"
      />
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 0.5rem;
      justify-content: space-between;
    }

    .vx-otp-box {
      flex: 1 1 0;
      min-width: 0;
      height: 3.25rem;
      border-radius: var(--vexto-radius-md);
      border: 1.5px solid var(--vexto-border);
      background: var(--vexto-surface);
      color: var(--vexto-text-primary);
      font-size: 1.5rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;
      caret-color: var(--vexto-primary);
      transition:
        border-color var(--vexto-transition),
        box-shadow var(--vexto-transition),
        background-color var(--vexto-transition);
    }

    .vx-otp-large .vx-otp-box {
      height: 4rem;
      font-size: 1.875rem;
    }

    .vx-otp-box:focus {
      outline: none;
      border-color: var(--vexto-primary);
      box-shadow: var(--vexto-focus-ring);
    }

    .vx-otp-invalid .vx-otp-box {
      border-color: var(--vexto-danger);
      animation: vx-otp-shake 240ms ease-in-out;
    }

    .vx-otp-disabled .vx-otp-box {
      opacity: 0.6;
    }

    @keyframes vx-otp-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .vx-otp-invalid .vx-otp-box {
        animation: none;
      }
    }
  `,
})
export class VxOtpInput {
  readonly length = input(6);
  readonly label = input('Verification code');
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** `large` is for the driver tablet, where the boxes should be tappable from arm's length. */
  readonly size = input<'default' | 'large'>('default');

  /** The digits typed so far, as one string. Set it to '' to clear the boxes. */
  readonly value = model('');

  /** Fires once, with the full code, the moment the last digit is entered or pasted. */
  readonly completed = output<string>();

  protected readonly slots = computed(() => Array.from({ length: this.length() }, (_, index) => index));

  /**
   * One entry per box, kept apart from `value` because a string cannot hold a gap: clearing the
   * second box of "12" must leave "1_" on screen, not shift the rest left.
   */
  protected readonly digits = signal<string[]>([]);

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');
  private readonly lastEmitted = signal<string | null>(null);

  constructor() {
    // The parent writes `value` (usually to clear it after a wrong code); the boxes follow. When
    // the boxes wrote it themselves the two already agree and nothing happens.
    effect(() => {
      const value = this.value();
      const length = this.length();

      if (value === this.digits().join('') && this.digits().length === length) {
        return;
      }

      const next = Array.from({ length }, (_, index) => value[index] ?? '');
      this.digits.set(next);

      if (value === '' && this.lastEmitted() !== null) {
        // Cleared after a submission: land the cursor back on the first box.
        this.lastEmitted.set(null);
        this.boxes()[0]?.nativeElement.focus();
      }
    });
  }

  /**
   * Empties every box and puts the cursor back on the first.
   *
   * A method rather than only the `value` binding, because a parent that sets the value to the
   * same thing it was at the last check — '' after the child had filled it and the parent had
   * cleared it again, all between two change-detection passes — is invisible to a binding.
   */
  clear(): void {
    this.digits.set(Array.from({ length: this.length() }, () => ''));
    this.value.set('');
    this.lastEmitted.set(null);
    this.focusBox(0);
  }

  /** Puts the cursor in the first empty box. Parents call this when the step appears. */
  focus(): void {
    const firstEmpty = this.digits().findIndex((digit) => digit === '');
    const index = firstEmpty === -1 ? this.length() - 1 : firstEmpty;
    this.boxes()[index]?.nativeElement.focus();
  }

  protected onInput(index: number, event: Event): void {
    const element = event.target as HTMLInputElement;
    const typed = element.value.replace(/\D/gu, '');

    // Some keyboards commit several characters at once (an autofill, a swipe); treat any
    // multi-character input as a paste starting at this box.
    if (typed.length > 1) {
      this.fill(index, typed);

      return;
    }

    const digits = this.snapshot();
    digits[index] = typed;
    this.commit(digits);

    if (typed && index < this.length() - 1) {
      this.focusBox(index + 1);
    }
  }

  protected onKeydown(index: number, event: KeyboardEvent): void {
    const digits = this.snapshot();

    switch (event.key) {
      case 'Backspace':
        if (!digits[index] && index > 0) {
          // Empty box: step back and clear the previous one, which is what people expect.
          event.preventDefault();
          digits[index - 1] = '';
          this.commit(digits);
          this.focusBox(index - 1);
        }

        break;

      case 'ArrowLeft':
        if (index > 0) {
          event.preventDefault();
          this.focusBox(index - 1);
        }

        break;

      case 'ArrowRight':
        if (index < this.length() - 1) {
          event.preventDefault();
          this.focusBox(index + 1);
        }

        break;

      default:
        // A non-digit printable key is refused here so the box never briefly shows it.
        if (event.key.length === 1 && !/\d/u.test(event.key) && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
        }
    }
  }

  protected onPaste(index: number, event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const pasted = text.replace(/\D/gu, '');

    if (!pasted) {
      return;
    }

    event.preventDefault();
    this.fill(index, pasted);
  }

  protected onFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  /** Writes a run of digits from `start`, as a paste does — "482 193" fills all six. */
  private fill(start: number, run: string): void {
    const digits = this.snapshot();

    // A paste of the whole code into a later box still means the whole code.
    const from = run.length >= this.length() ? 0 : start;

    for (let offset = 0; offset < run.length && from + offset < this.length(); offset++) {
      digits[from + offset] = run[offset];
    }

    this.commit(digits);

    const next = Math.min(from + run.length, this.length() - 1);
    this.focusBox(next);
  }

  /** A copy of the boxes, always exactly `length` long. */
  private snapshot(): string[] {
    return Array.from({ length: this.length() }, (_, index) => this.digits()[index] ?? '');
  }

  private commit(digits: string[]): void {
    this.digits.set(digits);

    const value = digits.join('');
    this.value.set(value);

    if (digits.every((digit) => digit !== '') && this.lastEmitted() !== value) {
      this.lastEmitted.set(value);
      this.completed.emit(value);
    }
  }

  private focusBox(index: number): void {
    const box = this.boxes()[index]?.nativeElement;
    box?.focus();
    box?.select();
  }
}
