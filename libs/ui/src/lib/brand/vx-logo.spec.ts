import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  INTER_CAP_RATIO,
  VEXTO_MARK_ASPECT,
  VEXTO_MARK_INK_VIEWBOX,
  VEXTO_MARK_ROUTE,
  VEXTO_MARK_WAYPOINT,
  VEXTO_WORDMARK_CAP_RATIO,
} from './vexto-mark.geometry';
import { VxLogo, type VxLogoTone, type VxLogoVariant } from './vx-logo';

function render(
  inputs: { variant?: VxLogoVariant; tone?: VxLogoTone; height?: number; label?: string } = {},
) {
  const fixture = TestBed.createComponent(VxLogo);

  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }

  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

describe('VxLogo', () => {
  it('draws the approved mark: two route strokes and a detached waypoint, and nothing else', () => {
    const element = render({ variant: 'mark' });
    const svg = element.querySelector('svg');

    expect(svg?.getAttribute('viewBox')).toBe(VEXTO_MARK_INK_VIEWBOX);

    // The mark is two primitives on purpose. A third shape appearing here means somebody has added
    // a road marking, an arrow or a second circle to a logo that is deliberately this simple.
    expect(element.querySelectorAll('svg > *')).toHaveLength(2);

    const path = element.querySelector('path');
    expect(path?.getAttribute('d')).toBe(VEXTO_MARK_ROUTE);
    expect(path?.getAttribute('stroke-linecap')).toBe('round');
    expect(path?.getAttribute('stroke-linejoin')).toBe('round');
    expect(path?.getAttribute('fill')).toBe('none');

    const waypoint = element.querySelector('circle');
    expect(waypoint?.getAttribute('r')).toBe(String(VEXTO_MARK_WAYPOINT.r));
  });

  it('renders the wordmark beside the mark for the horizontal lockup', () => {
    const element = render({ variant: 'horizontal' });

    expect(element.textContent?.trim()).toBe('Vexto');
    // A wordmark, not a tagline. "Transport", "Mobility" and the rest stay out of the logo.
    expect(element.textContent).not.toMatch(/transport|mobility|SaaS/i);
  });

  it('renders the mark alone for the symbol-only variant', () => {
    const element = render({ variant: 'mark' });

    expect(element.textContent?.trim()).toBe('');
    expect(element.querySelector('svg')).not.toBeNull();
  });

  it('sizes the lockup from the mark height, so the two never drift out of proportion', () => {
    const height = 40;
    const element = render({ variant: 'horizontal', height });
    const svg = element.querySelector('svg');
    const word = element.querySelector('span');

    expect(Number(svg?.getAttribute('height'))).toBe(height);
    expect(Number(svg?.getAttribute('width'))).toBeCloseTo(height * VEXTO_MARK_ASPECT, 1);

    // The wordmark is sized so its cap height — not its em box — lands at the lockup's ratio.
    const expected = (height * VEXTO_WORDMARK_CAP_RATIO) / INTER_CAP_RATIO;
    expect(Number.parseFloat(word?.style.fontSize ?? '')).toBeCloseTo(expected, 1);
  });

  it('takes the brand colour from tokens on a light surface', () => {
    const element = render({ tone: 'brand' });

    expect(element.querySelector('svg')?.style.color).toContain('--vexto-primary');
  });

  it('uses the lifted brand step on a permanently dark surface, not the brand value', () => {
    const element = render({ tone: 'on-dark' });
    const svg = element.querySelector('svg');

    // `--vexto-primary` is muddy on dark navy, and the rail is dark in both themes — so this must
    // be the dedicated token rather than the brand colour or a theme-dependent step.
    expect(svg?.style.color).toContain('--vexto-brand-on-dark');
    expect(svg?.style.color).not.toContain('var(--vexto-primary)');
  });

  it('inherits currentColor in monochrome, so it works on any ground', () => {
    const element = render({ tone: 'mono', variant: 'horizontal' });

    // The browser lower-cases the keyword when it round-trips through the style attribute.
    expect(element.querySelector('svg')?.style.color.toLowerCase()).toBe('currentcolor');
    expect(element.querySelector('span')?.style.color.toLowerCase()).toBe('currentcolor');
  });

  it('names the mark for assistive technology when there is no wordmark to do it', () => {
    const svg = render({ variant: 'mark' }).querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Vexto');
  });

  it('hides the mark from assistive technology when the wordmark already says Vexto', () => {
    const svg = render({ variant: 'horizontal' }).querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('stays silent when an ancestor already names it', () => {
    // The sidebar wraps the logo in <a aria-label="Vexto home">; announcing "Vexto" again inside it
    // is how a link comes to read "Vexto home Vexto".
    const svg = render({ variant: 'mark', label: '' }).querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });
});
