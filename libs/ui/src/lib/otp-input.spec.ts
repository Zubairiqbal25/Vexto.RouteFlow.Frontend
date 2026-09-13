import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { VxOtpInput } from './otp-input';

/**
 * The behaviours people expect of six little boxes, and quietly rage at when they are missing:
 * typing advances, backspace retreats, a paste fills all of them, and the code reaches the parent
 * as one string the moment it is complete.
 */
function mount(length = 6) {
  const fixture = TestBed.createComponent(VxOtpInput);
  fixture.componentRef.setInput('length', length);
  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;
  const boxes = () => [...host.querySelectorAll('input')] as HTMLInputElement[];

  const type = (index: number, text: string) => {
    const box = boxes()[index];
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  const press = (index: number, key: string) => {
    boxes()[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  const paste = (index: number, text: string) => {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    boxes()[index].dispatchEvent(event);
    fixture.detectChanges();
  };

  return { fixture, component: fixture.componentInstance, boxes, type, press, paste };
}

describe('VxOtpInput', () => {
  it('renders one numeric box per digit, with the attributes a phone needs', () => {
    const { boxes } = mount();

    expect(boxes()).toHaveLength(6);

    for (const box of boxes()) {
      expect(box.getAttribute('inputmode')).toBe('numeric');
      expect(box.getAttribute('maxlength')).toBe('1');
    }

    // The first box is what iOS and Android offer the code from the message to.
    expect(boxes()[0].getAttribute('autocomplete')).toBe('one-time-code');
    expect(boxes()[0].getAttribute('aria-label')).toBe('Digit 1 of 6');
  });

  it('advances focus as digits are typed and reports the code once complete', () => {
    const { component, boxes, type } = mount();
    const completed = vi.fn();
    component.completed.subscribe(completed);

    type(0, '4');
    expect(document.activeElement).toBe(boxes()[1]);

    type(1, '8');
    type(2, '2');
    type(3, '1');
    type(4, '9');
    expect(completed).not.toHaveBeenCalled();

    type(5, '3');

    expect(component.value()).toBe('482193');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith('482193');
  });

  it('fills every box from a paste, ignoring the spaces an email puts in the code', () => {
    const { component, boxes, paste } = mount();
    const completed = vi.fn();
    component.completed.subscribe(completed);

    paste(0, '482 193');

    expect(boxes().map((box) => box.value).join('')).toBe('482193');
    expect(component.value()).toBe('482193');
    expect(completed).toHaveBeenCalledWith('482193');
  });

  it('treats a whole-code paste into a later box as the whole code', () => {
    const { component, paste } = mount();

    paste(3, '482193');

    expect(component.value()).toBe('482193');
  });

  it('steps back and clears the previous box on backspace in an empty box', () => {
    const { component, boxes, type, press } = mount();

    type(0, '4');
    type(1, '8');
    expect(document.activeElement).toBe(boxes()[2]);

    press(2, 'Backspace');

    expect(document.activeElement).toBe(boxes()[1]);
    expect(component.value()).toBe('4');
  });

  it('keeps a gap rather than shifting digits when a middle box is cleared', () => {
    const { component, boxes, type } = mount();

    type(0, '1');
    type(1, '2');
    type(2, '3');
    type(1, '');

    expect(boxes().map((box) => box.value)).toEqual(['1', '', '3', '', '', '']);
    expect(component.value()).toBe('13');
  });

  it('refuses letters', () => {
    const { component, type } = mount();

    type(0, 'a');

    expect(component.value()).toBe('');
  });

  it('empties the boxes and returns to the first when the parent clears the value', () => {
    const { fixture, boxes, paste } = mount();

    paste(0, '482193');
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();

    expect(boxes().every((box) => box.value === '')).toBe(true);
    expect(document.activeElement).toBe(boxes()[0]);
  });

  it('marks every box invalid when told the code was wrong', () => {
    const { fixture, boxes } = mount();

    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    expect(boxes().every((box) => box.getAttribute('aria-invalid') === 'true')).toBe(true);
  });
});
