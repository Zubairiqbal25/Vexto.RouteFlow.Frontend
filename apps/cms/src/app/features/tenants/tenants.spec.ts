import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, Router, type RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthStore } from '@vexto/auth';
import type { AuthenticatedUser, SubscriptionPlan, TenantAdministrator, TenantResponse, TenantSubscription } from '@vexto/models';
import { ThemeService } from '@vexto/ui';
import { VEXTO_CONFIG } from '@vexto/utilities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tenantsGuard } from '../../tenants.guard';
import { OperatorPortalLink } from './operator-portal-link';
import { CmsTenantAdministrators } from './tenant-administrators';
import { CmsTenantCard } from './tenant-card';
import { CmsTenantDetailPage } from './tenant-detail.page';
import { administratorSummary, tenantReadiness } from './tenant-readiness';
import { CmsTenantWizardPage, type TenantDraft, validateStep } from './tenant-wizard.page';
import { CmsTenantsPage } from './tenants.page';

const API = 'https://api.test';

function tenant(overrides: Partial<TenantResponse> = {}): TenantResponse {
  return {
    id: 't1',
    name: 'Al Noor Transport',
    legalName: 'Al Noor Transport LLC',
    tradeLicenseNumber: 'TL-1001',
    tradeLicenseExpiryDate: '2031-01-01',
    taxRegistrationNumber: null,
    email: 'ops@alnoor.test',
    phone: '+971500000000',
    website: null,
    businessDetails: {
      addressLine1: null,
      addressLine2: null,
      city: 'Dubai',
      emirate: 'Dubai',
      country: 'United Arab Emirates',
      postalCode: null,
      primaryContactName: 'Ahmed Khan',
      primaryContactEmail: null,
      primaryContactPhone: null,
    },
    hasLogo: false,
    status: 'Active',
    health: [],
    members: { active: 1, invited: 0, suspended: 0, total: 1 },
    createdAtUtc: '2026-09-01T00:00:00Z',
    ...overrides,
  } as TenantResponse;
}

function administrator(overrides: Partial<TenantAdministrator> = {}): TenantAdministrator {
  return {
    userId: 'u1',
    email: 'zubair@example.com',
    firstName: 'Zubair',
    lastName: 'Iqbal',
    phoneNumber: null,
    roles: ['TenantOwner'],
    accountStatus: 'PendingInvitation',
    invitationStatus: 'Pending',
    invitationExpiresAtUtc: '2026-09-20T00:00:00Z',
    membershipStatus: 'Invited',
    createdAtUtc: '2026-09-13T00:00:00Z',
    lastLoginAtUtc: null,
    ...overrides,
  } as TenantAdministrator;
}

function subscription(overrides: Partial<TenantSubscription> = {}): TenantSubscription {
  return {
    id: 's1',
    planId: 'p1',
    planCode: 'growth',
    planName: 'Growth',
    status: 'Trial',
    startDate: '2026-09-01',
    endDate: null,
    trialEndsAtUtc: null,
    billingCycle: 'Monthly',
    price: 499,
    currency: 'AED',
    usage: { activeVehicles: 12, includedVehicles: 25, activePassengers: 340, includedPassengers: 500, status: 'Within' },
    ...overrides,
  } as TenantSubscription;
}

const plans: SubscriptionPlan[] = [
  { id: 'p0', code: 'starter', name: 'Starter', description: 'Small fleets', monthlyPrice: 199, currency: 'AED', includedVehicles: 10, includedPassengers: 150, extraPassengerPrice: 2, isActive: true },
  { id: 'p1', code: 'growth', name: 'Growth', description: null, monthlyPrice: 499, currency: 'AED', includedVehicles: 25, includedPassengers: 500, extraPassengerPrice: 1.5, isActive: true },
] as SubscriptionPlan[];

function draft(overrides: Partial<TenantDraft> = {}): TenantDraft {
  return {
    name: 'Vexto Test Transport',
    legalName: 'Vexto Test Transport LLC',
    tradeLicenseNumber: 'TL-9',
    tradeLicenseExpiryDate: '2031-06-30',
    taxRegistrationNumber: '',
    email: 'ops@vexto.test',
    phone: '+971500000000',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: 'Dubai',
    emirate: 'Dubai',
    country: 'United Arab Emirates',
    postalCode: '',
    primaryContactName: 'Ahmed Khan',
    primaryContactEmail: '',
    primaryContactPhone: '',
    timeZone: 'Asia/Dubai',
    defaultCurrency: 'AED',
    language: 'en',
    dateFormat: 'dd/MM/yyyy',
    passengerPaymentGracePeriodDays: 7,
    blockPassengersWithOverduePayments: false,
    planCode: '',
    billingCycle: 'Monthly',
    subscriptionStatus: 'Trial',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPhone: '',
    adminRole: 'TenantOwner',
    activateImmediately: false,
    ...overrides,
  };
}

function signIn(account: Partial<AuthenticatedUser> | null): void {
  localStorage.clear();

  if (account) {
    localStorage.setItem(
      'vexto.session',
      JSON.stringify({
        accessToken: 'x',
        accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        refreshToken: 'x',
        refreshTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
        user: {
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
          ...account,
        },
      }),
    );
  }
}

describe('tenant readiness (read-model)', () => {
  it('names each step and reports the fraction done, never a weighted score', () => {
    const ready = tenantReadiness(tenant(), subscription(), [administrator({ accountStatus: 'Active', membershipStatus: 'Active', invitationStatus: 'Accepted' })]);

    expect(ready.complete).toBe(true);
    expect(ready.percent).toBe(100);
    expect(ready.steps.map((step) => step.id)).toEqual(['business', 'contact', 'settings', 'plan', 'admin']);
  });

  it('flags a pending administrator invitation and a missing plan', () => {
    const ready = tenantReadiness(tenant(), subscription({ status: 'None', planCode: null, planName: null }), [administrator()]);

    expect(ready.complete).toBe(false);
    expect(ready.percent).toBe(60);
    expect(ready.steps.find((step) => step.id === 'admin')?.hint).toContain('pending');
    expect(ready.steps.find((step) => step.id === 'plan')?.done).toBe(false);
  });

  it('summarises the administrator state from membership counts', () => {
    expect(administratorSummary(tenant()).label).toBe('Active');
    expect(administratorSummary(tenant({ members: { active: 0, invited: 1, suspended: 0, total: 1 } })).label).toBe('Invitation pending');
    expect(administratorSummary(tenant({ members: { active: 0, invited: 0, suspended: 0, total: 0 } })).label).toBe('None yet');
  });
});

describe('wizard validation', () => {
  it('requires the business identity before the first step can continue', () => {
    expect(validateStep('business', draft())).toBeNull();
    expect(validateStep('business', draft({ name: '' }))).toContain('trading name');
    expect(validateStep('business', draft({ tradeLicenseNumber: '' }))).toContain('trade licence');
    expect(validateStep('business', draft({ tradeLicenseExpiryDate: '' }))).toContain('expiry');
    expect(validateStep('business', draft({ email: 'nope' }))).toContain('email');
  });

  it('requires a primary contact and validates the admin block as all-or-nothing', () => {
    expect(validateStep('contact', draft({ primaryContactName: '' }))).toContain('primary contact');
    expect(validateStep('admin', draft())).toBeNull();
    expect(validateStep('admin', draft({ adminFirstName: 'A' }))).toContain('email');
    expect(validateStep('admin', draft({ adminEmail: 'not-an-email' }))).toContain('email');
    expect(validateStep('admin', draft({ adminEmail: 'a@b.test' }))).toContain('name');
    expect(validateStep('admin', draft({ adminEmail: 'a@b.test', adminFirstName: 'A', adminLastName: 'B' }))).toBeNull();
  });

  it('bounds the grace period', () => {
    expect(validateStep('settings', draft({ passengerPaymentGracePeriodDays: 120 }))).toContain('90');
  });
});

describe('tenantsGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function run(): boolean | UrlTree {
    return runInInjectionContext(TestBed.inject(Injector), () =>
      tenantsGuard({} as ActivatedRouteSnapshot, { url: '/tenants' } as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('lets a ServiceAdmin in', () => {
    signIn({ isServiceAdmin: true, roles: ['ServiceAdmin'] });
    TestBed.inject(AuthStore);

    expect(run()).toBe(true);
  });

  it('sends a tenant administrator to access-denied, even one with every tenant permission', () => {
    signIn({ tenantId: 't1', tenantName: 'Al Noor', roles: ['TenantOwner'], permissions: ['Users.Manage', 'Settings.Manage', 'Content.View'] });

    const result = run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/access-denied');
  });
});

describe('CMS tenant screens', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    signIn({ isServiceAdmin: true, roles: ['ServiceAdmin'] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VEXTO_CONFIG, useValue: { apiBaseUrl: API, operatorPortalUrl: 'https://operator.test' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    http.verify();
  });

  it('renders a tenant card with initials as the logo fallback, and no raw id', () => {
    const fixture = TestBed.createComponent(CmsTenantCard);
    fixture.componentRef.setInput('tenant', tenant({ members: { active: 0, invited: 1, suspended: 0, total: 1 } }));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';

    expect(text).toContain('Al Noor Transport');
    expect(text).toContain('Al Noor Transport LLC');
    expect(text).toContain('Dubai');
    expect(text).toContain('Ahmed Khan');
    expect(text).toContain('Invitation pending');
    expect(text).toContain('Open Tenant');
    expect(text).not.toContain('t1');
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.vx-avatar')?.textContent?.trim()).toBe('AT');
  });

  it('lists tenants as cards and filters by search, status and emirate', () => {
    const fixture = TestBed.createComponent(CmsTenantsPage);
    fixture.detectChanges();

    const first = http.expectOne((request) => request.url === `${API}/api/v1/platform/tenants`);
    expect(first.request.params.keys()).not.toContain('emirate');
    first.flush({ items: [tenant(), tenant({ id: 't2', name: 'Gulf Transit', legalName: 'Gulf Transit LLC' })], pageNumber: 1, pageSize: 20, totalCount: 2 });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('vexto-cms-tenant-card')).toHaveLength(2);
    expect(element.textContent).toContain('Gulf Transit');

    const emirate = element.querySelector<HTMLSelectElement>('select[aria-label="Filter by emirate"]')!;
    emirate.value = 'Sharjah';
    emirate.dispatchEvent(new Event('change'));

    const filtered = http.expectOne((request) => request.url === `${API}/api/v1/platform/tenants`);
    expect(filtered.request.params.get('emirate')).toBe('Sharjah');
    filtered.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0 });
    fixture.detectChanges();

    expect(element.textContent).toContain('No matching tenants');

    const status = element.querySelector<HTMLSelectElement>('select[aria-label="Filter by status"]')!;
    status.value = 'Pending';
    status.dispatchEvent(new Event('change'));

    const byStatus = http.expectOne((request) => request.url === `${API}/api/v1/platform/tenants`);
    expect(byStatus.request.params.get('status')).toBe('Pending');
    expect(byStatus.request.params.get('emirate')).toBe('Sharjah');
    byStatus.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0 });
  });

  it('walks the wizard: defaults from the server, plan step, admin step, one onboarding request, success screen', () => {
    const fixture = TestBed.createComponent(CmsTenantWizardPage);
    fixture.detectChanges();

    http.expectOne(`${API}/api/v1/platform/tenants/settings-catalogue`).flush({
      defaults: { timeZone: 'Asia/Dubai', defaultCurrency: 'AED', dateFormat: 'dd/MM/yyyy', language: 'en', passengerPaymentGracePeriodDays: 7, blockPassengersWithOverduePayments: false, updatedAtUtc: null },
      supportedCurrencies: ['AED', 'USD'],
      supportedLanguages: ['en', 'ar'],
      supportedDateFormats: ['dd/MM/yyyy'],
    });
    http.expectOne(`${API}/api/v1/platform/subscription-plans`).flush(plans);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const type = (name: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const next = () => {
      element.querySelector<HTMLButtonElement>('[data-testid="wizard-continue"]')!.click();
      fixture.detectChanges();
    };

    // Validation is displayed rather than silently blocking.
    next();
    expect(element.querySelector('[data-testid="step-error"]')?.textContent).toContain('trading name');

    type('name', 'Vexto Test Transport');
    type('legalName', 'Vexto Test Transport LLC');
    type('tradeLicenseNumber', 'TL-TEST-1');
    type('tradeLicenseExpiryDate', '2031-06-30');
    type('email', 'ops@vexto.test');
    type('phone', '+971500000000');
    next();

    type('city', 'Dubai');
    type('emirate', 'Dubai');
    type('primaryContactName', 'Ahmed Khan');
    next();

    // Settings arrived from the server, not from a constant in the template.
    expect(element.querySelector<HTMLInputElement>('[name="timeZone"]')!.value).toBe('Asia/Dubai');
    type('gracePeriod', '14');
    next();

    element.querySelector<HTMLButtonElement>('[data-testid="plan-growth"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="plan-growth"]')?.getAttribute('aria-checked')).toBe('true');
    next();

    type('adminFirstName', 'Zubair');
    type('adminLastName', 'Iqbal');
    type('adminEmail', 'zubair@example.com');
    next();

    const review = element.querySelector('[data-testid="review"]')!.textContent ?? '';
    expect(review).toContain('Vexto Test Transport');
    expect(review).toContain('Growth');
    expect(review).toContain('zubair@example.com');
    expect(review).not.toContain('password');

    element.querySelector<HTMLButtonElement>('[data-testid="wizard-submit"]')!.click();
    fixture.detectChanges();

    // Disabled while in flight, so a second click cannot create a second tenant.
    expect(element.querySelector<HTMLButtonElement>('[data-testid="wizard-submit"]')!.disabled).toBe(true);

    const request = http.expectOne(`${API}/api/v1/platform/tenants/onboarding`);
    const body = request.request.body as { tenant: Record<string, unknown>; plan: Record<string, unknown> };
    expect(body.plan['planCode']).toBe('growth');
    expect((body.tenant['settings'] as Record<string, unknown>)['passengerPaymentGracePeriodDays']).toBe(14);
    expect((body.tenant['owner'] as Record<string, unknown>)['role']).toBe('TenantOwner');
    expect(JSON.stringify(body)).not.toContain('password');

    request.flush({
      tenant: { tenant: tenant({ id: 'new', name: 'Vexto Test Transport', status: 'Pending' }), ownerUserId: 'u9', ownerInvitationExpiresAtUtc: null, ownerInvitationAcceptUrl: null, ownerInvitationDelivery: 'Sent' },
      subscriptionId: 's9',
    });
    fixture.detectChanges();

    const success = element.querySelector('[data-testid="onboarding-success"]')!.textContent ?? '';
    expect(success).toContain('Vexto Test Transport has been created.');
    expect(success).toContain('Pending');
    expect(success).toContain('zubair@example.com');
    expect(element.querySelector('[data-testid="invitation-delivery"]')?.textContent?.trim()).toBe('Sent');
    expect(success).toContain('Resend Invitation');
    expect(success).toContain('Switch to Tenant');
  });

  it('says plainly when invitation delivery failed and re-sends from the success screen', () => {
    const fixture = TestBed.createComponent(CmsTenantWizardPage);
    fixture.detectChanges();
    http.expectOne(`${API}/api/v1/platform/tenants/settings-catalogue`).flush({ defaults: { timeZone: 'Asia/Dubai', defaultCurrency: 'AED', dateFormat: 'dd/MM/yyyy', language: 'en', passengerPaymentGracePeriodDays: 7, blockPassengersWithOverduePayments: false, updatedAtUtc: null }, supportedCurrencies: [], supportedLanguages: [], supportedDateFormats: [] });
    http.expectOne(`${API}/api/v1/platform/subscription-plans`).flush([]);

    (fixture.componentInstance as unknown as { created: { set: (value: unknown) => void } }).created.set({
      tenant: { tenant: tenant({ id: 'new' }), ownerUserId: 'u9', ownerInvitationExpiresAtUtc: null, ownerInvitationAcceptUrl: null, ownerInvitationDelivery: 'Failed' },
      subscriptionId: null,
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Invitation delivery failed');

    element.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes('Resend Invitation')) {
        button.click();
      }
    });

    http.expectOne(`${API}/api/v1/platform/tenants/new/administrators/u9/resend-invitation`).flush({
      administrator: administrator(),
      invitationId: 'i2',
      expiresAtUtc: '2026-09-20T00:00:00Z',
      delivery: 'Sent',
      acceptUrl: null,
    });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="invitation-delivery"]')?.textContent?.trim()).toBe('Sent');
  });

  it('renders the tenant detail with readiness, plan and the administrators list', () => {
    const fixture = TestBed.createComponent(CmsTenantDetailPage);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.detectChanges();

    http.expectOne(`${API}/api/v1/platform/subscription-plans`).flush(plans);
    http.expectOne(`${API}/api/v1/platform/tenants/settings-catalogue`).flush({ defaults: { timeZone: 'Asia/Dubai', defaultCurrency: 'AED', dateFormat: 'dd/MM/yyyy', language: 'en', passengerPaymentGracePeriodDays: 7, blockPassengersWithOverduePayments: false, updatedAtUtc: null }, supportedCurrencies: ['AED'], supportedLanguages: ['en'], supportedDateFormats: ['dd/MM/yyyy'] });

    const detail = { tenant: tenant({ status: 'Pending', members: { active: 0, invited: 1, suspended: 0, total: 1 } }), settings: { timeZone: 'Asia/Dubai', defaultCurrency: 'AED', dateFormat: 'dd/MM/yyyy', language: 'en', passengerPaymentGracePeriodDays: 7, blockPassengersWithOverduePayments: false, updatedAtUtc: null }, memberCount: 1 };
    http.match(`${API}/api/v1/platform/tenants/t1`).forEach((request) => request.flush(detail));
    http.expectOne(`${API}/api/v1/platform/tenants/t1/administrators`).flush([administrator()]);
    http.expectOne(`${API}/api/v1/platform/tenants/t1/subscription`).flush(subscription());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="tenant-name"]')?.textContent).toContain('Al Noor Transport');
    expect(element.querySelector('[data-testid="tenant-plan"]')?.textContent).toContain('Growth');
    expect(element.querySelector('[data-testid="setup-percent"]')?.textContent).toContain('80%');
    expect(element.querySelector('[data-testid="readiness"]')?.textContent).toContain('Invitation pending');
    expect(element.querySelector('[data-testid="activate-tenant"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="open-operator-portal"]')).not.toBeNull();

    // The administrators tab lists the invited owner with a resend action.
    element.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((button) => {
      if (button.textContent?.includes('Administrators')) {
        button.click();
      }
    });
    fixture.detectChanges();

    const list = element.querySelector('[data-testid="administrator-list"]')!.textContent ?? '';
    expect(list).toContain('Zubair Iqbal');
    expect(list).toContain('zubair@example.com');
    expect(list).toContain('Tenant Owner');
    expect(list).toContain('Invitation pending');
  });

  it('re-sends an administrator invitation and tells the parent to reload', () => {
    const fixture = TestBed.createComponent(CmsTenantAdministrators);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('administrators', [administrator()]);
    fixture.detectChanges();

    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('vx-row-actions button')!.click();
    fixture.detectChanges();

    element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]').forEach((button) => {
      if (button.textContent?.includes('Resend invitation')) {
        button.click();
      }
    });

    http.expectOne(`${API}/api/v1/platform/tenants/t1/administrators/u1/resend-invitation`).flush({
      administrator: administrator(),
      invitationId: 'i2',
      expiresAtUtc: '2026-09-20T00:00:00Z',
      delivery: 'Sent',
      acceptUrl: null,
    });

    expect(changed).toBe(1);
  });

  it('offers only the two tenant administrator roles when inviting, and never a password', () => {
    const fixture = TestBed.createComponent(CmsTenantAdministrators);
    fixture.componentRef.setInput('tenantId', 't1');
    fixture.componentRef.setInput('administrators', []);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[data-testid="invite-administrator"]')!.click();
    fixture.detectChanges();

    const options = Array.from(element.querySelectorAll<HTMLOptionElement>('[name="inviteRole"] option')).map((option) => option.value);
    expect(options).toEqual(['TenantOwner', 'TenantAdmin']);
    expect(element.querySelector('input[type="password"]')).toBeNull();

    element.querySelector<HTMLButtonElement>('[data-testid="send-invitation"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="invite-error"]')?.textContent).toContain('name');
  });

  it('builds the operator portal support link from runtime configuration', () => {
    const link = TestBed.inject(OperatorPortalLink);

    expect(link.available).toBe(true);
    expect(link.url('t1')).toBe('https://operator.test/platform/support/t1');
  });

  it('renders the tenant card in the dark theme', () => {
    TestBed.inject(ThemeService).set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const fixture = TestBed.createComponent(CmsTenantCard);
    fixture.componentRef.setInput('tenant', tenant());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Al Noor Transport');
    TestBed.inject(ThemeService).set('system');
  });
});
