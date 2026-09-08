import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme';

/**
 * `matchMedia` does not exist in jsdom, and the service reads it at construction. This stands in
 * for it and, crucially, lets a test fire a change — which is the only way to prove that `system`
 * mode is live rather than read once at start-up.
 */
function stubMatchMedia(dark: boolean): { fire: (matches: boolean) => void } {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];
  let matches = dark;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.push(listener),
      removeEventListener: vi.fn(),
    })),
  );

  return {
    fire: (next: boolean) => {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

function theme(): string | null {
  return document.documentElement.getAttribute('data-theme');
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('defaults to system and follows a light operating system', () => {
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.effective()).toBe('light');
    expect(theme()).toBe('light');
  });

  it('follows a dark operating system when the preference is system', () => {
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.isDark()).toBe(true);
    expect(theme()).toBe('dark');
  });

  it('applies an explicit dark choice regardless of the operating system', () => {
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    service.set('dark');

    expect(service.effective()).toBe('dark');
    expect(theme()).toBe('dark');
  });

  it('persists the preference so a reload keeps it', () => {
    stubMatchMedia(false);

    TestBed.inject(ThemeService).set('dark');

    expect(localStorage.getItem('vexto.theme')).toBe('dark');

    // A second construction stands in for a reload.
    TestBed.resetTestingModule();

    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
  });

  it('repaints when the operating system theme changes and the preference is system', () => {
    const media = stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    expect(service.effective()).toBe('light');

    media.fire(true);

    // No reload, no second click. This is the property that makes `system` worth offering.
    expect(service.effective()).toBe('dark');
    expect(theme()).toBe('dark');
  });

  it('ignores the operating system once the user has chosen explicitly', () => {
    const media = stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    service.set('light');

    media.fire(true);

    expect(service.effective()).toBe('light');
    expect(theme()).toBe('light');
  });

  it('cycles light to dark to system', () => {
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);
    service.set('light');

    service.cycle();
    expect(service.preference()).toBe('dark');

    service.cycle();
    expect(service.preference()).toBe('system');

    service.cycle();
    expect(service.preference()).toBe('light');
  });

  it('falls back to system when the stored value is nonsense', () => {
    stubMatchMedia(false);
    localStorage.setItem('vexto.theme', 'chartreuse');

    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });
});
