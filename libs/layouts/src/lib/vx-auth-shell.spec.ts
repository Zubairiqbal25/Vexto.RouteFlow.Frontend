import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { VxAuthShell } from './vx-auth-shell';

/**
 * This shell *is* the login screen of all three applications — the operator portal, the driver app
 * and the passenger app each route `/login` through it — so what it renders is what "the driver
 * login shows the Vexto brand" means in this workspace. The apps supply only two sentences of copy.
 */
function render(inputs: { headline?: string; subheadline?: string } = {}) {
  const fixture = TestBed.createComponent(VxAuthShell);

  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }

  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

describe('VxAuthShell branding', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('leads the sign-in form with the horizontal Vexto lockup', () => {
    const logo = render().querySelector('vx-logo');

    expect(logo).not.toBeNull();
    expect(logo?.querySelector('svg')).not.toBeNull();
    expect(logo?.textContent).toContain('Vexto');
  });

  it('draws the form-side mark in the brand colour from tokens', () => {
    const logo = render().querySelector('vx-logo');

    expect(logo?.querySelector('svg')?.style.color).toContain('--vexto-primary');
  });

  it('reverses the brand panel lockup to monochrome, because the panel ground is brand-coloured', () => {
    const logos = [...render().querySelectorAll('vx-logo')];

    expect(logos).toHaveLength(2);

    const panelLogo = logos[1];
    expect(panelLogo.querySelector('svg')?.style.color.toLowerCase()).toBe('currentcolor');
    expect(panelLogo.querySelector('span')?.style.color.toLowerCase()).toBe('currentcolor');
  });

  it('keeps the driver and passenger copy without a second brand', () => {
    const element = render({
      headline: 'Your trips, in your hand.',
      subheadline: 'Pick-ups, passengers and navigation for the day ahead.',
    });

    expect(element.textContent).toContain('Your trips, in your hand.');

    // Each app tells its own story under one Vexto identity: two lockups (form and panel) and no
    // per-app logo.
    expect(element.querySelectorAll('vx-logo')).toHaveLength(2);
  });
});
