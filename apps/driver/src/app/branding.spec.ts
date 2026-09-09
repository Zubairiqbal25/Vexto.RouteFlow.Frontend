import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { VxAuthShell } from '@vexto/layouts';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { beforeEach, describe, expect, it } from 'vitest';
import { DriverShell, routes } from './app.routes';

/**
 * The driver app carries the same Vexto identity as the portal — no driver-specific logo — and its
 * operational screens keep it deliberately small. A tablet propped on a dashboard with a trip
 * running should spend its pixels on the trip.
 */
describe('driver branding', () => {
  beforeEach(() => {
    // The signed-in shell reaches the notification bell and the session, which reach the API
    // client. Nothing here makes a request; these just satisfy the injector.
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: VEXTO_CONFIG, useValue: { apiBaseUrl: '/api' } },
      ],
    });
  });

  it('signs the driver in through the branded Vexto auth shell', () => {
    const signedOut = routes.find((route) => route.component === VxAuthShell);

    expect(signedOut).toBeDefined();
    expect(signedOut?.children?.some((child) => child.path === 'login')).toBe(true);
  });

  it('shows the Vexto lockup on the login screen', () => {
    const fixture = TestBed.createComponent(VxAuthShell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const logo = element.querySelector('vx-logo');

    expect(logo).not.toBeNull();
    expect(logo?.querySelector('svg')).not.toBeNull();
    expect(logo?.textContent).toContain('Vexto');
  });

  it('keeps branding to the mark once the driver is working', () => {
    const fixture = TestBed.createComponent(DriverShell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const logo = element.querySelector('vx-logo');

    expect(logo).not.toBeNull();

    // The mark alone. The header line beside it already names the app, and a wordmark there would
    // repeat it in the one place screen space is scarcest.
    expect(logo?.textContent?.trim()).toBe('');
    expect(logo?.querySelector('svg')?.getAttribute('aria-label')).toBe('Vexto');
  });
});
