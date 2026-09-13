import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthApi, VextoApiError } from '@vexto/api-client';
import { AUTH_STORAGE_KEY, AuthStore } from '@vexto/auth';
import type { AuthenticatedUser, AuthenticationResponse } from '@vexto/models';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VxLoginPage, maskEmail } from './vx-login-page';

/**
 * The passwordless sign-in, as a person meets it: an email, a code, a destination. No password
 * field, no "forgot password" link, a resend that waits, and a way back to fix a typo.
 */
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

function session(as: AuthenticatedUser): AuthenticationResponse {
  return {
    accessToken: 'token',
    accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
    refreshToken: 'refresh',
    refreshTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
    user: as,
  } as AuthenticationResponse;
}

const requested = {
  message: 'If an account exists for this email, a verification code has been sent.',
  codeLength: 6,
  expiresInMinutes: 5,
  resendCooldownSeconds: 60,
};

describe('VxLoginPage', () => {
  const api = {
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };

  const navigateByUrl = vi.fn();

  function mount(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(VxLoginPage);

    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    const enterEmail = (email: string) => {
      const input = host.querySelector('#email') as HTMLInputElement;
      input.value = email;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    const submit = () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    const pasteCode = (code: string) => {
      const box = host.querySelector('vx-otp-input input') as HTMLInputElement;
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => code } });
      box.dispatchEvent(event);
      fixture.detectChanges();
    };

    const button = (name: string) =>
      [...host.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim().startsWith(name));

    return { fixture, host, enterEmail, submit, pasteCode, button };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    api.requestOtp.mockReset().mockReturnValue(of(requested));
    api.verifyOtp.mockReset();
    navigateByUrl.mockReset().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApi, useValue: api },
        { provide: AUTH_STORAGE_KEY, useValue: 'vexto.test.session' },
      ],
    });

    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(navigateByUrl);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for an email only — no password field, no forgot-password link', () => {
    const { host } = mount();

    expect(host.querySelector('#email')).not.toBeNull();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.textContent).not.toMatch(/password/iu);
    expect(host.textContent).toContain('Welcome back');
    expect(host.querySelector('#email')?.getAttribute('autocomplete')).toBe('email');
    expect(host.querySelector('#email')?.getAttribute('inputmode')).toBe('email');
  });

  it('requests a code and moves to the code step, showing the address masked', () => {
    const { host, enterEmail, submit } = mount();

    enterEmail('zubairiqbal25@gmail.com');
    submit();

    expect(api.requestOtp).toHaveBeenCalledWith('zubairiqbal25@gmail.com');
    expect(host.textContent).toContain('Check your email');
    expect(host.textContent).toContain('zu***@gmail.com');
    expect(host.textContent).not.toContain('zubairiqbal25@gmail.com');
    expect(host.querySelector('vx-otp-input')).not.toBeNull();
  });

  it('uses the one-time-code and numeric attributes a phone keyboard needs', () => {
    const { host, enterEmail, submit } = mount();

    enterEmail('passenger@vexto.test');
    submit();

    const first = host.querySelector('vx-otp-input input') as HTMLInputElement;
    expect(first.getAttribute('autocomplete')).toBe('one-time-code');
    expect(first.getAttribute('inputmode')).toBe('numeric');
  });

  it('verifies a pasted code and stores the session', () => {
    api.verifyOtp.mockReturnValue(of(session(user())));
    const { enterEmail, submit, pasteCode } = mount({ home: '/dashboard' });

    enterEmail('owner@vexto.test');
    submit();
    pasteCode('482 193');

    expect(api.verifyOtp).toHaveBeenCalledWith('owner@vexto.test', '482193');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('sends a ServiceAdmin to the platform dashboard and a tenant user to the operator home', () => {
    api.verifyOtp.mockReturnValue(of(session(user({ isServiceAdmin: true, tenantId: null, roles: ['ServiceAdmin'] }))));
    const admin = mount({ home: '/dashboard', platformHome: '/platform' });
    admin.enterEmail('zubairiqbal25@gmail.com');
    admin.submit();
    admin.pasteCode('482193');

    expect(navigateByUrl).toHaveBeenCalledWith('/platform');

    navigateByUrl.mockClear();
    api.verifyOtp.mockReturnValue(of(session(user())));
    const tenant = mount({ home: '/dashboard', platformHome: '/platform' });
    tenant.enterEmail('owner@vexto.test');
    tenant.submit();
    tenant.pasteCode('482193');

    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('lands a driver on the driver home and a passenger on the passenger home', () => {
    api.verifyOtp.mockReturnValue(of(session(user({ roles: ['Driver'] }))));
    const driver = mount({ home: '/trips' });
    driver.enterEmail('driver@vexto.test');
    driver.submit();
    driver.pasteCode('482193');

    expect(navigateByUrl).toHaveBeenCalledWith('/trips');

    navigateByUrl.mockClear();
    api.verifyOtp.mockReturnValue(of(session(user({ roles: ['Passenger'] }))));
    const passenger = mount({ home: '/home' });
    passenger.enterEmail('passenger@vexto.test');
    passenger.submit();
    passenger.pasteCode('482193');

    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('shows the server sentence for a wrong code, clears the boxes and stays on the step', () => {
    api.verifyOtp.mockReturnValue(
      throwError(() => new VextoApiError('unauthorized', 'The code is not valid or has expired. Request a new code and try again.', 401)),
    );
    const { host, enterEmail, submit, pasteCode } = mount();

    enterEmail('owner@vexto.test');
    submit();
    pasteCode('000000');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('The code is not valid or has expired');
    expect(host.querySelector('vx-otp-input')?.getAttribute('aria-invalid')).toBe('true');
    expect([...host.querySelectorAll('vx-otp-input input')].every((box) => (box as HTMLInputElement).value === '')).toBe(true);
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
  });

  it('counts the resend cooldown down before offering to resend', () => {
    const { fixture, host, enterEmail, submit, button } = mount();

    enterEmail('owner@vexto.test');
    submit();

    expect(host.textContent).toContain('Resend code in 60s');
    expect(button('Resend code')).toBeUndefined();

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();

    expect(host.textContent).not.toContain('Resend code in');
    expect(button('Resend code')).toBeDefined();

    button('Resend code')!.click();
    fixture.detectChanges();

    expect(api.requestOtp).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Resend code in 60s');
  });

  it('goes back to the email step, keeping the address, on "Use another email"', () => {
    const { fixture, host, enterEmail, submit, button } = mount();

    enterEmail('ownre@vexto.test');
    submit();
    expect(host.textContent).toContain('Check your email');

    button('Use another email')!.click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Welcome back');
    expect((host.querySelector('#email') as HTMLInputElement).value).toBe('ownre@vexto.test');
    expect(host.querySelector('vx-otp-input')).toBeNull();
  });

  it('does not request a code while the request is in flight or the email is invalid', () => {
    const pending = new Subject<typeof requested>();
    api.requestOtp.mockReturnValue(pending);
    const { host, enterEmail, submit } = mount();

    enterEmail('not-an-email');
    submit();
    expect(api.requestOtp).not.toHaveBeenCalled();

    enterEmail('owner@vexto.test');
    submit();
    submit();
    expect(api.requestOtp).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Sending code…');
  });
});

describe('maskEmail', () => {
  it('keeps just enough of the local part to be recognisable', () => {
    expect(maskEmail('zubairiqbal25@gmail.com')).toBe('zu***@gmail.com');
    expect(maskEmail('a@vexto.test')).toBe('a***@vexto.test');
    expect(maskEmail('nonsense')).toBe('nonsense');
  });
});
