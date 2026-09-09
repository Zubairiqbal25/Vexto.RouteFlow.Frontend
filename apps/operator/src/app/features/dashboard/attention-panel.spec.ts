import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AttentionItem } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { AttentionPanel } from './attention-panel';

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    kind: 'BlockedPassengers',
    count: 3,
    message: '3 passengers are blocked from travel',
    link: '/passengers?access=Blocked',
    ...overrides,
  } as AttentionItem;
}

function render(items: readonly AttentionItem[], loading = false) {
  const fixture = TestBed.createComponent(AttentionPanel);

  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('loading', loading);
  fixture.detectChanges();

  return fixture;
}

const text = (items: readonly AttentionItem[], loading = false) =>
  render(items, loading).nativeElement.textContent as string;

describe('AttentionPanel', () => {
  beforeEach(() => {
    // RouterLink needs a router; the panel is otherwise a pure rendering of what it is given.
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('says so plainly when nothing needs attention', () => {
    // A real and common answer, and one worth drawing: a panel that only ever appears when
    // something is wrong leaves people wondering whether it loaded.
    expect(text([])).toContain('Nothing needs attention right now');
  });

  it('renders the server’s wording rather than rebuilding it from the count', () => {
    // The pluralisation is the server's, against the actual value. A template assembling
    // "{{count}} passengers" is exactly where "1 passengers" comes from.
    expect(text([item({ count: 1, message: '1 passenger is blocked from travel' })])).toContain(
      '1 passenger is blocked from travel',
    );
  });

  it('deep links each item to the filtered list it came from', () => {
    const fixture = render([item()]);
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;

    // An item nobody can act on is a worry, not a task.
    expect(link.getAttribute('href')).toBe('/passengers?access=Blocked');
  });

  it('splits a link that carries no query string', () => {
    const fixture = render([item({ link: '/vehicles' })]);
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/vehicles');
  });

  it('lists every condition it is given, in the order the server ranked them', () => {
    const rendered = text([
      item({ kind: 'TripsWithoutDriver', message: '2 upcoming trips have no driver assigned' }),
      item({ kind: 'VehiclesInMaintenance', message: '1 vehicle is in maintenance' }),
    ]);

    expect(rendered.indexOf('no driver assigned')).toBeLessThan(rendered.indexOf('maintenance'));
  });

  it('does not claim everything is fine while it is still loading', () => {
    expect(text([], true)).not.toContain('Nothing needs attention');
  });
});
