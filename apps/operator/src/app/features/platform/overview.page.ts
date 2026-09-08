import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformApi } from '@vexto/api-client';
import { AuthStore } from '@vexto/auth';
import type { TenantResponse } from '@vexto/models';
import {
  VxCardGrid,
  VxEmptyState,
  VxIcon,
  VxMetricCard,
  VxSectionCard,
  VxSkeletonCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatDate } from '@vexto/utilities';
import { TenantCard } from './tenant-card';

/**
 * Vexto's own view of the platform.
 *
 * **Deliberately about operators, not about their passengers.** A platform administrator needs to
 * know how many operators there are, which of them are live, and which need attention — not how
 * many people rode a bus in Dubai this morning. Aggregating every tenant's operational data onto
 * one screen would mean a cross-tenant read of exactly the private records tenant isolation exists
 * to keep apart, for a number nobody at Vexto acts on. To see inside an operator, enter their
 * context; that is audited and deliberate.
 *
 * The counts come from the tenant list the page already loads, filtered client-side. That is honest
 * here and would not be at scale: a hundred operators is one page, and the moment it is not, this
 * needs a real summary endpoint rather than a larger page size.
 */
@Component({
  selector: 'vexto-platform-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TenantCard,
    VxCardGrid,
    VxEmptyState,
    VxIcon,
    VxMetricCard,
    VxSectionCard,
    VxSkeletonCard,
    VxStatusBadge,
  ],
  template: `
    <header class="mb-6">
      <p
        class="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold"
        style="background: var(--vexto-primary-soft); color: var(--vexto-primary-active)"
      >
        <vx-icon name="shield" [size]="13" />
        Vexto platform
      </p>
      <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {{ greeting() }}, {{ firstName() }}
      </h1>
      <p class="mt-1 text-body text-ink-muted">
        Every transport operator on the platform, and how their accounts stand.
      </p>
    </header>

    <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <vx-metric-card
        label="Operators"
        icon="building"
        accent="primary"
        [loading]="loading()"
        [value]="total()"
        context="On the platform"
      />
      <vx-metric-card
        label="Active"
        icon="check-circle"
        accent="success"
        [loading]="loading()"
        [value]="counts().active"
        context="Able to operate"
      />
      <vx-metric-card
        label="Awaiting activation"
        icon="clock"
        accent="warning"
        [loading]="loading()"
        [value]="counts().pending"
        context="Licence not yet checked"
      />
      <vx-metric-card
        label="Suspended"
        icon="ban"
        [accent]="counts().suspended > 0 ? 'danger' : 'neutral'"
        [loading]="loading()"
        [value]="counts().suspended"
        context="Cannot sign in"
      />
    </div>

    @if (counts().pending > 0) {
      <vx-section-card
        class="mb-6 block"
        title="Waiting for you"
        description="Operators that have been created but not yet activated."
      >
        <vx-card-grid [dense]="true">
          @for (tenant of pending(); track tenant.id) {
            <vexto-tenant-card [tenant]="tenant" />
          }
        </vx-card-grid>
      </vx-section-card>
    }

    <vx-section-card
      title="Recently onboarded"
      description="The newest operators on the platform."
    >
      <a actions class="vx-btn vx-btn-secondary vx-btn-sm" routerLink="/platform/tenants">
        View all
      </a>

      @if (loading()) {
        <vx-card-grid [dense]="true"><vx-skeleton-card [count]="3" /></vx-card-grid>
      } @else if (recent().length === 0) {
        <vx-empty-state
          icon="building"
          title="No operators yet"
          description="Onboard your first transport operator to get started."
        />
      } @else {
        <ul class="flex flex-col">
          @for (tenant of recent(); track tenant.id) {
            <li class="flex items-center gap-3 border-b border-line-subtle py-3 last:border-0">
              <span
                class="flex size-9 flex-none items-center justify-center rounded-lg text-meta font-semibold"
                style="background: var(--vexto-surface-sunken); color: var(--vexto-text-secondary)"
                aria-hidden="true"
              >
                {{ monogram(tenant.name) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-body font-medium text-ink">{{ tenant.name }}</p>
                <p class="truncate text-meta text-ink-muted">
                  Onboarded {{ onboarded(tenant.createdAtUtc) }}
                </p>
              </div>
              <vx-status-badge [status]="tenant.status" />
            </li>
          }
        </ul>
      }
    </vx-section-card>
  `,
})
export class PlatformOverviewPage {
  private readonly api = inject(PlatformApi);
  private readonly store = inject(AuthStore);

  protected readonly onboarded = formatDate;

  protected readonly loading = signal(true);
  private readonly tenants = signal<TenantResponse[]>([]);
  protected readonly total = signal<number | string>('—');

  protected readonly firstName = computed(() => this.store.user()?.firstName ?? 'there');

  protected readonly counts = computed(() => {
    const tenants = this.tenants();

    return {
      active: tenants.filter((tenant) => tenant.status === 'Active').length,
      pending: tenants.filter((tenant) => tenant.status === 'Pending').length,
      suspended: tenants.filter((tenant) => tenant.status === 'Suspended').length,
    };
  });

  protected readonly pending = computed(() =>
    this.tenants().filter((tenant) => tenant.status === 'Pending'),
  );

  protected readonly recent = computed(() =>
    [...this.tenants()]
      .sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc))
      .slice(0, 6),
  );

  constructor() {
    this.api.list({ pageSize: 100 }).subscribe({
      next: (result) => {
        this.tenants.set(result.items);
        this.total.set(result.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected greeting(): string {
    const hour = new Date().getHours();

    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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
}
