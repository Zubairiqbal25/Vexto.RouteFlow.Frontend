import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { VxPicker, type VxPickerOption } from './picker';

/**
 * The failures these tests are about were real.
 *
 * A pilot database with fifty-three routes rendered the first twenty into a `<select>` and stopped;
 * the remaining thirty-three could not be chosen at all, and nothing on screen said so — the list
 * simply ended, which reads exactly like a complete list. Everything below is a property of the
 * component that keeps that from coming back: the term reaches the server, the server's answer is
 * what is shown, a selection made outside the visible page still displays, and a fast typist does
 * not generate a request per keystroke.
 */

const DEBOUNCE_MS = 250;

function options(count: number, prefix = 'Route'): VxPickerOption[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    label: `${prefix} ${index}`,
    secondaryLabel: null,
  }));
}

function mount(search: (term: string) => Observable<readonly VxPickerOption[]>, limit = 20) {
  const fixture = TestBed.createComponent(VxPicker);

  fixture.componentRef.setInput('inputId', 'p');
  fixture.componentRef.setInput('search', search);
  fixture.componentRef.setInput('limit', limit);
  fixture.detectChanges();

  const input = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const text = () => fixture.nativeElement.textContent as string;

  const open = () => {
    input().dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    fixture.detectChanges();
  };

  const type = (term: string) => {
    input().value = term;
    input().dispatchEvent(new Event('input'));
  };

  const settle = (ms = DEBOUNCE_MS) => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };

  return { fixture, input, text, open, type, settle };
}

describe('VxPicker', () => {
  it('asks the server rather than filtering a page it already has', () => {
    vi.useFakeTimers();

    const search = vi.fn((term: string) => of(options(term ? 3 : 20)));
    const picker = mount(search);

    picker.open();
    expect(search).toHaveBeenCalledWith('');

    picker.type('zubair');
    picker.settle();

    // The whole point: the term goes to the server, and the server decides what matches. A record
    // outside the first page is reachable precisely because this is not a client-side filter.
    expect(search).toHaveBeenCalledWith('zubair');

    vi.useRealTimers();
  });

  it('finds a record the first page never contained', () => {
    vi.useFakeTimers();

    // Fifty-three routes, twenty per page. "Route 51" is not in the first page and never will be.
    const all = options(53);
    const search = vi.fn((term: string) =>
      of(all.filter((option) => option.label.includes(term)).slice(0, 20)),
    );

    const picker = mount(search);

    picker.open();
    expect(picker.text()).not.toContain('Route 51');

    picker.type('Route 51');
    picker.settle();

    expect(picker.text()).toContain('Route 51');

    vi.useRealTimers();
  });

  it('says out loud that the list is capped, rather than letting it just end', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(20)));

    picker.open();

    // A truncated list reads exactly like a complete one unless something says otherwise.
    expect(picker.text()).toContain('Type to narrow the list');

    vi.useRealTimers();
  });

  it('does not claim a cap it has not reached', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(4)));

    picker.open();
    expect(picker.text()).not.toContain('Type to narrow');

    vi.useRealTimers();
  });

  it('distinguishes "nothing matches" from "there is nothing to choose"', () => {
    vi.useFakeTimers();

    const picker = mount((term) => of(term ? [] : options(0)));

    picker.open();
    expect(picker.text()).toContain('There is nothing to choose yet');

    picker.type('Ahmed');
    picker.settle();

    // One of these the user can fix by trying another spelling; the other needs somebody to go and
    // create a record.
    expect(picker.text()).toContain('Nothing matches');
    expect(picker.text()).toContain('Ahmed');

    vi.useRealTimers();
  });

  it('debounces, so a typed name is one request rather than six', () => {
    vi.useFakeTimers();

    const search = vi.fn(() => of(options(2)));
    const picker = mount(search);

    picker.open();
    search.mockClear();

    for (const term of ['a', 'ah', 'ahm', 'ahme', 'ahmed']) {
      picker.type(term);
      vi.advanceTimersByTime(40);
    }

    picker.settle();

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('ahmed');

    vi.useRealTimers();
  });

  it('shows the last term’s results, not whichever request happened to finish last', () => {
    vi.useFakeTimers();

    const slow = new Subject<readonly VxPickerOption[]>();
    const fast = new Subject<readonly VxPickerOption[]>();

    const picker = mount((term) => (term === 'slow' ? slow : fast));

    picker.open();

    picker.type('slow');
    picker.settle();

    picker.type('fast');
    picker.settle();

    // The abandoned request answers late. switchMap has already unsubscribed from it, so it cannot
    // overwrite the newer answer — this is the out-of-order result that makes a type-ahead show
    // matches for a term nobody is looking at any more.
    fast.next([{ id: 'f', label: 'Fast result', secondaryLabel: null }]);
    slow.next([{ id: 's', label: 'Stale result', secondaryLabel: null }]);
    picker.fixture.detectChanges();

    expect(picker.text()).toContain('Fast result');
    expect(picker.text()).not.toContain('Stale result');

    vi.useRealTimers();
  });

  it('displays a selection the search results do not contain', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(20)));

    // An edit form loading a record whose driver is the four-hundredth alphabetically. The picker
    // shows the caller's selection, so it never falls back to rendering an id.
    picker.fixture.componentRef.setInput('selected', {
      id: 'far-away',
      label: 'Zulfiqar Hussain',
      secondaryLabel: 'DXB-99999',
    });
    picker.fixture.detectChanges();

    expect(picker.input().value).toBe('Zulfiqar Hussain');

    vi.useRealTimers();
  });

  it('emits the chosen option', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(3)));
    const chosen: string[] = [];

    picker.fixture.componentInstance.chosen.subscribe((option) => chosen.push(option?.id ?? 'null'));

    picker.open();

    const first = picker.fixture.nativeElement.querySelector(
      '[role="option"]',
    ) as HTMLButtonElement;

    first.click();

    expect(chosen).toEqual(['id-0']);

    vi.useRealTimers();
  });

  it('offers a way back to nothing chosen when the value is optional', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(3)));
    const chosen: (string | null)[] = [];

    picker.fixture.componentRef.setInput('clearable', true);
    picker.fixture.componentRef.setInput('selected', options(1)[0]);
    picker.fixture.componentInstance.chosen.subscribe((option) => chosen.push(option?.id ?? null));
    picker.fixture.detectChanges();

    const clear = picker.fixture.nativeElement.querySelector(
      'button[aria-label^="Clear"]',
    ) as HTMLButtonElement;

    clear.click();

    // Without this the only way to undo a filter is to reload the page, losing everything else set.
    expect(chosen).toEqual([null]);

    vi.useRealTimers();
  });

  it('announces a validation failure rather than only colouring the border', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(1)));

    picker.fixture.componentRef.setInput('invalid', true);
    picker.fixture.detectChanges();

    expect(picker.input().getAttribute('aria-invalid')).toBe('true');

    vi.useRealTimers();
  });

  it('does not open while disabled', () => {
    vi.useFakeTimers();

    const search = vi.fn(() => of(options(3)));
    const picker = mount(search);

    picker.fixture.componentRef.setInput('disabled', true);
    picker.fixture.detectChanges();
    picker.open();

    expect(search).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('is a combobox the keyboard can drive', () => {
    vi.useFakeTimers();

    const picker = mount(() => of(options(3)));
    const chosen: string[] = [];

    picker.fixture.componentInstance.chosen.subscribe((option) => chosen.push(option?.id ?? 'null'));

    picker.open();

    // A picker that only works with a mouse is a picker half the operators cannot use.
    picker.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    picker.fixture.detectChanges();
    picker.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    picker.fixture.detectChanges();

    expect(chosen).toEqual(['id-1']);

    vi.useRealTimers();
  });
});
