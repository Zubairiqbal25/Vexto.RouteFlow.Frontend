import { TestBed } from '@angular/core/testing';
import type { TripActivityEvent } from '@vexto/models';
import { describe, expect, it } from 'vitest';
import { TripActivity } from './trip-activity';

function event(overrides: Partial<TripActivityEvent> = {}): TripActivityEvent {
  return {
    id: 'e1',
    type: 'TripStarted',
    occurredAtUtc: '2026-09-08T06:02:00Z',
    actor: { displayName: 'Ahmed' },
    summary: 'Trip started',
    detail: 'Ahmed Khan · A 12345',
    ...overrides,
  } as TripActivityEvent;
}

function text(events: readonly TripActivityEvent[], options: { hasMore?: boolean; loading?: boolean } = {}) {
  const fixture = TestBed.createComponent(TripActivity);

  fixture.componentRef.setInput('events', events);
  fixture.componentRef.setInput('hasMore', options.hasMore ?? false);
  fixture.componentRef.setInput('loading', options.loading ?? false);
  fixture.detectChanges();

  return fixture.nativeElement.textContent as string;
}

describe('TripActivity', () => {
  it('offers a useful empty state rather than a blank panel', () => {
    const rendered = text([]);

    expect(rendered).toContain('No activity recorded yet');
    expect(rendered).toContain('driver or vehicle changes');
  });

  it('renders the server’s own wording, not a caption rebuilt here', () => {
    // The summary and detail were written against the state as it was at the time, so a crew change
    // still says what changed after both buses have been sold.
    const rendered = text([
      event({
        id: 'e2',
        type: 'VehicleChanged',
        summary: 'Vehicle changed',
        detail: 'A 12345 → B 55421',
        actor: { displayName: 'Dispatch' },
      }),
    ]);

    expect(rendered).toContain('Vehicle changed');
    expect(rendered).toContain('A 12345 → B 55421');
  });

  it('names the actor beside the detail', () => {
    expect(text([event()])).toContain('Ahmed');
  });

  it('renders an event nobody performed without inventing an actor', () => {
    const rendered = text([
      event({ type: 'TripGenerated', summary: 'Trip generated', detail: null, actor: null }),
    ]);

    expect(rendered).toContain('Trip generated');
    expect(rendered).not.toContain('System');
  });

  it('keeps the order it was given, which is the order things happened', () => {
    const rendered = text([
      event({ id: 'a', summary: 'Trip started' }),
      event({ id: 'b', type: 'PassengerBoarded', summary: 'Muhammad Zubair boarded', detail: null }),
      event({ id: 'c', type: 'TripCompleted', summary: 'Trip completed', detail: null }),
    ]);

    expect(rendered.indexOf('Trip started')).toBeLessThan(rendered.indexOf('Muhammad Zubair'));
    expect(rendered.indexOf('Muhammad Zubair')).toBeLessThan(rendered.indexOf('Trip completed'));
  });

  it('says when the list was cut short, so a short timeline is not read as a quiet trip', () => {
    expect(text([event()], { hasMore: true })).toContain('Only the most recent events');
  });

  it('shows placeholders while loading rather than the empty state', () => {
    const rendered = text([], { loading: true });

    expect(rendered).not.toContain('No activity recorded yet');
  });
});
