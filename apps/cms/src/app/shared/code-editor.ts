import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * A plain code editor: a monospace textarea that understands Tab and can insert at the caret.
 *
 * Not a syntax-highlighting editor and not a WYSIWYG builder — the phase deliberately stops short of
 * both. What a template author needs is to see the markup exactly as it will be stored, to indent
 * without leaving the field, and to drop a variable where the cursor is. A ControlValueAccessor so
 * it sits in a reactive form like any other input.
 */
@Component({
  selector: 'vexto-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditor), multi: true }],
  host: { class: 'block' },
  template: `
    <textarea
      #area
      class="vx-input w-full resize-y font-mono text-[13px] leading-relaxed"
      [style.min-height]="minHeight()"
      [id]="inputId()"
      [attr.aria-label]="label()"
      [attr.aria-invalid]="invalid() || null"
      [disabled]="disabled()"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      wrap="off"
      [value]="value()"
      (input)="onInput($event)"
      (blur)="onTouched()"
      (keydown.tab)="onTab($event)"
    ></textarea>
  `,
})
export class CodeEditor implements ControlValueAccessor {
  /** The textarea's id, for a label. Named apart from `id` so the host element does not carry a duplicate. */
  readonly inputId = input<string | null>(null);
  readonly label = input('Code');
  readonly minHeight = input('280px');
  readonly invalid = input(false);

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /** Drops text at the caret (replacing a selection) and keeps the caret after it. */
  insertAtCaret(text: string): void {
    const element = this.area().nativeElement;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const next = element.value.slice(0, start) + text + element.value.slice(end);

    this.commit(next);

    // The value binding lands on the next render; the caret can be placed now.
    element.value = next;
    element.setSelectionRange(start + text.length, start + text.length);
    element.focus();
  }

  protected onInput(event: Event): void {
    this.commit((event.target as HTMLTextAreaElement).value);
  }

  /** Two spaces, like the rest of the codebase — and Shift+Tab is left to the browser for focus. */
  protected onTab(event: Event): void {
    const keyboard = event as KeyboardEvent;

    if (keyboard.shiftKey) {
      return;
    }

    keyboard.preventDefault();
    this.insertAtCaret('  ');
  }

  private commit(value: string): void {
    this.value.set(value);
    this.onChange(value);
  }
}
