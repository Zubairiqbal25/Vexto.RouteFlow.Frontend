import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { VxAuthShell } from '@vexto/layouts';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { beforeEach, describe, expect, it } from 'vitest';
import { PassengerShell, routes } from './app.routes';

/**
 * The passenger app carries the same Vexto identity as the portal. Branding lives in the shell and
 * the app icon; the home screen belongs to the next ride, tracking and what is owed, which is what
 * somebody opens the app to find out.
 */
describe('passenger branding', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: VEXTO_CONFIG, useValue: { apiBaseUrl: '/api' } },
      ],
    });
  });

  it('signs the passenger in through the branded Vexto auth shell', () => {
    const signedOut = routes.find((route) => route.component === VxAuthShell);

    expect(signedOut).toBeDefined();
    expect(signedOut?.children?.some((child) => child.path === 'login')).toBe(true);
  });

  it('shows the Vexto lockup on the login screen', () => {
    const fixture = TestBed.createComponent(VxAuthShell);
    fixture.detectChanges();

    const logo = (fixture.nativeElement as HTMLElement).querySelector('vx-logo');

    expect(logo?.querySelector('svg')).not.toBeNull();
    expect(logo?.textContent).toContain('Vexto');
  });

  it('keeps the home shell to the mark rather than a banner', () => {
    const fixture = TestBed.createComponent(PassengerShell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const logos = element.querySelectorAll('vx-logo');

    // Exactly one, and the symbol only: a logo repeated down a phone screen is space taken from
    // the upcoming ride.
    expect(logos).toHaveLength(1);
    expect(logos[0].textContent?.trim()).toBe('');
  });
});
