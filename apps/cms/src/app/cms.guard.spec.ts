import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, Router, type RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthStore } from '@vexto/auth';
import type { AuthenticatedUser } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { cmsGuard } from './cms.guard';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'admin@vexto.ae',
    firstName: 'Zubair',
    lastName: 'Iqbal',
    phoneNumber: null,
    tenantId: null,
    tenantName: null,
    isServiceAdmin: false,
    roles: [],
    permissions: [],
    ...overrides,
  } as AuthenticatedUser;
}

function signIn(account: AuthenticatedUser | null): void {
  localStorage.clear();

  if (account) {
    localStorage.setItem(
      'vexto.session',
      JSON.stringify({
        accessToken: 'x',
        accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        refreshToken: 'x',
        refreshTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        user: account,
      }),
    );
  }
}

function run(): boolean | UrlTree {
  const injector = TestBed.inject(Injector);

  return runInInjectionContext(injector, () =>
    cmsGuard({} as ActivatedRouteSnapshot, { url: '/email-templates' } as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

describe('cmsGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('lets a ServiceAdmin in', () => {
    signIn(user({ isServiceAdmin: true, roles: ['ServiceAdmin'] }));
    TestBed.inject(AuthStore);

    expect(run()).toBe(true);
  });

  it('lets an account holding Content.View in, whatever its role is called', () => {
    signIn(user({ permissions: ['Content.View'] }));

    expect(run()).toBe(true);
  });

  it('sends a tenant user to the access-denied page', () => {
    signIn(user({ tenantId: 't1', tenantName: 'Al Noor', roles: ['TenantAdmin'], permissions: ['Users.Manage', 'Passengers.View'] }));

    const result = run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/access-denied');
  });

  it('sends a signed-out visitor to sign in with the intended URL preserved', () => {
    signIn(null);

    const result = run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Femail-templates');
  });
});
