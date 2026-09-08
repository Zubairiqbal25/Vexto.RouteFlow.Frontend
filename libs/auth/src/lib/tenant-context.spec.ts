import { TestBed } from '@angular/core/testing';
import type { AuthenticatedUser } from '@vexto/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, AuthStore } from './auth-store';
import { TenantContextService } from './tenant-context';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'someone@vexto.test',
    firstName: 'Sam',
    lastName: 'Ali',
    phoneNumber: null,
    tenantId: 't1',
    tenantName: 'Al Noor Transport',
    isServiceAdmin: false,
    roles: ['TenantOwner'],
    permissions: [],
    ...overrides,
  } as AuthenticatedUser;
}

function signIn(as: AuthenticatedUser): void {
  TestBed.inject(AuthStore).set({
    accessToken: 'token',
    accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
    refreshToken: 'refresh',
    refreshTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
    user: as,
  });
}

describe('TenantContextService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AUTH_STORAGE_KEY, useValue: 'vexto.test.session' }],
    });
  });

  it('lets a platform administrator switch, and shows the platform context by default', () => {
    signIn(user({ isServiceAdmin: true, tenantId: null, tenantName: null, roles: ['ServiceAdmin'] }));

    const context = TestBed.inject(TenantContextService);

    expect(context.canSwitch()).toBe(true);
    expect(context.current()).toBeNull();

    // Not "nothing selected": the cross-tenant view is a real state with a name.
    expect(context.label()).toBe('Platform Overview');
  });

  it('sends the header only once a platform administrator has entered a tenant', () => {
    signIn(user({ isServiceAdmin: true, tenantId: null, tenantName: null }));

    const context = TestBed.inject(TenantContextService);
    expect(context.currentId()).toBeNull();

    context.enter({ id: 't9', name: 'Emirates Staff Transport' });

    expect(context.currentId()).toBe('t9');
    expect(context.label()).toBe('Emirates Staff Transport');
  });

  it('returns to the platform context when the administrator leaves a tenant', () => {
    signIn(user({ isServiceAdmin: true, tenantId: null, tenantName: null }));

    const context = TestBed.inject(TenantContextService);
    context.enter({ id: 't9', name: 'Emirates Staff Transport' });
    context.leave();

    expect(context.currentId()).toBeNull();
    expect(context.label()).toBe('Platform Overview');
  });

  it('refuses to hold a context for a normal tenant user', () => {
    signIn(user());

    const context = TestBed.inject(TenantContextService);

    expect(context.canSwitch()).toBe(false);

    context.enter({ id: 't9', name: 'Somebody Else Transport' });

    // Nothing is stored, and nothing is sent. The API rejects the header outright from a
    // non-ServiceAdmin, so a stray value here would break every request the user makes.
    expect(context.currentId()).toBeNull();
    expect(context.current()).toBeNull();
  });

  it('shows a tenant user their own operator, and never another', () => {
    signIn(user({ tenantName: 'Al Noor Transport' }));

    expect(TestBed.inject(TenantContextService).label()).toBe('Al Noor Transport');
  });

  it('remembers the support context across a reload', () => {
    signIn(user({ isServiceAdmin: true, tenantId: null, tenantName: null }));
    TestBed.inject(TenantContextService).enter({ id: 't9', name: 'Emirates Staff Transport' });

    // A second construction stands in for a reload.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AUTH_STORAGE_KEY, useValue: 'vexto.test.session' }],
    });
    signIn(user({ isServiceAdmin: true, tenantId: null, tenantName: null }));

    expect(TestBed.inject(TenantContextService).currentId()).toBe('t9');
  });

  it('ignores a stored context belonging to a session that cannot switch', () => {
    // A platform administrator signs out on a shared machine; a tenant user signs in next.
    localStorage.setItem('vexto.tenantContext', JSON.stringify({ id: 't9', name: 'Elsewhere' }));

    signIn(user());

    expect(TestBed.inject(TenantContextService).currentId()).toBeNull();
  });
});
