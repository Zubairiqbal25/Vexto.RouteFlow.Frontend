import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore, TenantContextService } from '@vexto/auth';
import type { AuthenticatedUser } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NavSection } from './navigation';
import { VxSidebar } from './vx-sidebar';

const SECTIONS: readonly NavSection[] = [
  { label: 'Operations', items: [{ label: 'Trips', icon: 'routes', link: '/trips' }] },
];

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'dispatcher@alnoor.ae',
    firstName: 'Layla',
    lastName: 'Haddad',
    phoneNumber: null,
    tenantId: 't1',
    tenantName: 'Al Noor Transport',
    isServiceAdmin: false,
    roles: ['Dispatcher'],
    permissions: [],
    ...overrides,
  } as AuthenticatedUser;
}

function render(collapsed: boolean, account = user(), afterSignIn?: () => void) {
  TestBed.inject(AuthStore).setUser(account);

  // Anything that depends on who is signed in has to run after the account is in place —
  // `TenantContextService.enter` refuses outright unless the current user may switch tenants.
  afterSignIn?.();

  const fixture = TestBed.createComponent(VxSidebar);

  fixture.componentRef.setInput('sections', SECTIONS);
  fixture.componentRef.setInput('collapsed', collapsed);
  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
}

/** The brand block is the header of the rail; the nav items below it also render an icon each. */
function brandBlock(element: HTMLElement): HTMLElement {
  const logo = element.querySelector('vx-logo');
  expect(logo).not.toBeNull();

  return logo as HTMLElement;
}

describe('VxSidebar branding', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    // `setUser` needs a session to merge into, and AuthStore reads storage at construction.
    localStorage.setItem(
      'vexto.session',
      JSON.stringify({
        accessToken: 'x',
        accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        refreshToken: 'x',
        refreshTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        user: user(),
      }),
    );
  });

  it('renders the horizontal Vexto lockup when expanded', () => {
    const element = render(false);
    const logo = brandBlock(element);

    expect(logo.querySelector('svg')).not.toBeNull();
    expect(logo.textContent).toContain('Vexto');
  });

  it('renders the mark alone when collapsed', () => {
    const logo = brandBlock(render(true));

    // A 76px rail has no room for a wordmark, which is the whole reason the symbol exists.
    expect(logo.querySelector('svg')).not.toBeNull();
    expect(logo.textContent?.trim()).toBe('');
  });

  it('draws the mark in the lifted brand step, because the rail is dark in both themes', () => {
    const logo = brandBlock(render(false));

    expect(logo.querySelector('svg')?.style.color).toContain('--vexto-brand-on-dark');
  });

  it('names the rail link once, rather than repeating Vexto inside it', () => {
    const link = render(false).querySelector('a[aria-label="Vexto home"]');

    expect(link).not.toBeNull();
    expect(link?.querySelector('svg')?.getAttribute('aria-label')).toBeNull();
  });

  it('puts the platform context under the Vexto brand for a ServiceAdmin, not a second logo', () => {
    const element = render(false, user({ isServiceAdmin: true, tenantId: null, tenantName: null }));

    expect(element.textContent).toContain('Vexto');
    expect(element.textContent).toContain('Platform administration');

    // One brand, seen from above — not a ServiceAdmin mark of its own.
    expect(element.querySelectorAll('vx-logo')).toHaveLength(1);
  });

  it('drops the platform line once a ServiceAdmin enters one operator context', () => {
    const account = user({ isServiceAdmin: true, tenantId: null, tenantName: null });

    const element = render(false, account, () =>
      TestBed.inject(TenantContextService).enter({ id: 't1', name: 'Al Noor Transport' }),
    );

    // The top bar now says whose context this is; this line would contradict it.
    expect(element.textContent).not.toContain('Platform administration');
  });

  it('shows no platform line to an ordinary tenant user', () => {
    expect(render(false).textContent).not.toContain('Platform administration');
  });
});
