import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlatformApi } from '@vexto/api-client';
import { TenantContextService } from '@vexto/auth';
import type { TenantPickerOption } from '@vexto/models';
import { VxIcon, VxStatusBadge } from '@vexto/ui';

/**
 * Which operator you are working in.
 *
 * Two genuinely different controls behind one component, because they answer the same question for
 * different people:
 *
 * - **A normal tenant user** sees their operator's name and nothing else — no dropdown, no search,
 *   no chevron. Their tenant comes from their token and cannot be changed, and offering a control
 *   that appears to change it would be offering something the API will refuse. It is displayed at
 *   all because Vexto is multi-tenant and somebody who administers two operators must never be in
 *   doubt about which one they are editing.
 * - **A ServiceAdmin** gets a searchable list of every operator, plus "Platform Overview" — the
 *   cross-tenant context, which is a real state rather than "nothing selected".
 *
 * Switching navigates back to the dashboard rather than staying put. The screen you were on was
 * showing another operator's records, and silently repainting the same route with different data is
 * how somebody edits the wrong tenant's passenger.
 */
@Component({
  selector: 'vx-tenant-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxIcon, VxStatusBadge],
  host: { '(document:click)': 'closeIfOutside($event)', class: 'relative' },
  template: `
    @if (canSwitch()) {
      <button
        type="button"
        class="flex max-w-[13rem] items-center gap-2 rounded-lg border border-line px-2.5 py-1.5
               text-body font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
        style="background: var(--vexto-surface-muted)"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        aria-label="Switch tenant"
        (click)="toggle($event)"
      >
        <vx-icon [name]="current() ? 'building' : 'globe'" [size]="15" />
        <span class="truncate">{{ label() }}</span>
        <vx-icon name="chevron-down" [size]="14" />
      </button>

      @if (open()) {
        <div
          class="vx-card absolute end-0 z-50 mt-2 w-80 overflow-hidden shadow-pop"
          style="background: var(--vexto-surface-raised)"
          role="listbox"
          aria-label="Tenants"
        >
          <div class="relative border-b border-line-subtle p-2">
            <span
              class="pointer-events-none absolute inset-y-0 start-4 flex items-center text-ink-muted"
            >
              <vx-icon name="search" [size]="15" />
            </span>
            <input
              #searchBox
              type="search"
              class="vx-input ps-8"
              placeholder="Search tenants…"
              aria-label="Search tenants"
              [value]="term()"
              (input)="onSearch($event)"
            />
          </div>

          <div class="vx-scroll max-h-80 overflow-y-auto py-1">
            <!-- The cross-tenant view. First, because it is where platform work starts. -->
            <button
              type="button"
              role="option"
              class="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-surface-hover"
              [attr.aria-selected]="current() === null"
              (click)="choosePlatform()"
            >
              <span
                class="flex size-8 flex-none items-center justify-center rounded-lg"
                style="background: var(--vexto-primary-soft); color: var(--vexto-primary-active)"
              >
                <vx-icon name="globe" [size]="16" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-body font-medium text-ink">Platform Overview</span>
                <span class="block truncate text-meta text-ink-muted">All operators</span>
              </span>
              @if (current() === null) {
                <vx-icon name="check" [size]="16" />
              }
            </button>

            @if (loading()) {
              @for (row of [1, 2, 3]; track row) {
                <div class="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
                  <div class="vx-skeleton size-8 flex-none rounded-lg"></div>
                  <div class="flex-1">
                    <div class="vx-skeleton h-3.5 w-2/3"></div>
                    <div class="vx-skeleton mt-1.5 h-3 w-1/3"></div>
                  </div>
                </div>
              }
            } @else if (tenants().length === 0) {
              <p class="px-3 py-6 text-center text-meta text-ink-muted">
                No operators match “{{ term() }}”.
              </p>
            } @else {
              @for (tenant of tenants(); track tenant.id) {
                <button
                  type="button"
                  role="option"
                  class="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-surface-hover"
                  [attr.aria-selected]="current()?.id === tenant.id"
                  (click)="choose(tenant)"
                >
                  <span
                    class="flex size-8 flex-none items-center justify-center rounded-lg text-meta font-semibold"
                    style="background: var(--vexto-surface-sunken); color: var(--vexto-text-secondary)"
                  >
                    {{ monogram(tenant.name) }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-body font-medium text-ink">
                      {{ tenant.name }}
                    </span>
                    @if (tenant.location) {
                      <span class="block truncate text-meta text-ink-muted">
                        {{ tenant.location }}
                      </span>
                    }
                  </span>
                  <vx-status-badge [status]="tenant.status" />
                </button>
              }
            }
          </div>
        </div>
      }
    } @else if (label(); as name) {
      <!-- A tenant user: identity, not a control. There is nothing here to press. -->
      <span
        class="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-meta
               font-medium text-ink-secondary sm:inline-flex"
        style="background: var(--vexto-surface-muted)"
      >
        <vx-icon name="building" [size]="14" />
        {{ name }}
      </span>
    }
  `,
})
export class VxTenantSelector {
  private readonly platform = inject(PlatformApi);
  private readonly context = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly searches = new Subject<string>();

  protected readonly canSwitch = this.context.canSwitch;
  protected readonly current = this.context.current;
  protected readonly label = this.context.label;

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly loading = signal(false);
  protected readonly tenants = signal<readonly TenantPickerOption[]>([]);

  constructor() {
    // Debounced, so a fast typist makes one request rather than eight.
    this.searches
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loading.set(true);

          return this.platform.picker(term || null);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (options) => {
          this.tenants.set(options);
          this.loading.set(false);
        },
        error: () => {
          this.tenants.set([]);
          this.loading.set(false);
        },
      });

    // The first open loads the unfiltered list, so the control is useful before anything is typed.
    effect(() => {
      if (this.open() && this.tenants().length === 0 && !this.loading()) {
        this.searches.next(this.term());
      }
    });
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open.update((value) => !value);
  }

  /** Containment rather than stopping propagation inside the panel; see VxQuickActions. */
  protected closeIfOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected onSearch(event: Event): void {
    const term = (event.target as HTMLInputElement).value;

    this.term.set(term);
    this.searches.next(term);
  }

  protected choose(tenant: TenantPickerOption): void {
    this.context.enter({
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      location: tenant.location,
    });

    this.leaveScreen();
  }

  protected choosePlatform(): void {
    this.context.leave();
    this.leaveScreen('/platform/tenants');
  }

  protected monogram(name: string): string {
    return name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  /**
   * Leaves the current screen after a switch.
   *
   * The page you were on was showing another operator's records. Repainting the same route with
   * different data is how somebody ends up editing the wrong tenant's passenger, so the switch
   * always lands somewhere neutral.
   */
  private leaveScreen(path = '/'): void {
    this.open.set(false);
    this.tenants.set([]);
    this.term.set('');

    void this.router.navigateByUrl(path);
  }
}
