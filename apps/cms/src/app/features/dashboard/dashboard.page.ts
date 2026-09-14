import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentApi, PlatformApi, VextoApiError } from '@vexto/api-client';
import type { ContentSummary, RecentTemplateChange, TenantSummary } from '@vexto/models';
import {
  VxAvatar,
  VxEmptyState,
  VxErrorState,
  VxIcon,
  VxMetricCard,
  VxPageHeader,
  VxSectionCard,
  VxStatusBadge,
} from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

/**
 * The CMS front page: tenant onboarding at a glance, then platform content.
 *
 * Deliberately no charts. A platform administrator wants to know how many operators are live, how
 * many are waiting to be activated or to accept an invitation, and what changed last; a trend line
 * of template edits would be a picture of nothing. Every number is a count the server aggregated —
 * nothing here is a list fetched to be counted in the browser, and nothing is invented.
 */
@Component({
  selector: 'vexto-cms-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxAvatar, VxEmptyState, VxErrorState, VxIcon, VxMetricCard, VxPageHeader, VxSectionCard, VxStatusBadge],
  template: `
    <vx-page-header title="Dashboard" description="Tenant onboarding and platform content at a glance." />

    <h2 class="vx-section-label mb-3">Tenants</h2>

    @if (tenantsError(); as message) {
      <vx-error-state title="We could not load the tenant summary" [message]="message" (retry)="loadTenants()" />
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="tenant-metrics">
        <vx-metric-card label="Total tenants" icon="building" [value]="tenants()?.totalTenants ?? '—'" [loading]="tenantsLoading()" context="Every operator on the platform" />
        <vx-metric-card label="Active" icon="check-circle" accent="success" [value]="tenants()?.activeTenants ?? '—'" [loading]="tenantsLoading()" context="Users can sign in" />
        <vx-metric-card label="Pending" icon="clock" [accent]="(tenants()?.pendingTenants ?? 0) > 0 ? 'warning' : 'neutral'" [value]="tenants()?.pendingTenants ?? '—'" [loading]="tenantsLoading()" context="Created, not yet activated" />
        <vx-metric-card label="Suspended" icon="ban" [accent]="(tenants()?.suspendedTenants ?? 0) > 0 ? 'danger' : 'neutral'" [value]="tenants()?.suspendedTenants ?? '—'" [loading]="tenantsLoading()" context="Access withdrawn" />
        <vx-metric-card label="Pending admin invitations" icon="send" [accent]="(tenants()?.pendingInvitations ?? 0) > 0 ? 'info' : 'neutral'" [value]="tenants()?.pendingInvitations ?? '—'" [loading]="tenantsLoading()" context="Invited, not yet accepted" />
      </div>

      <vx-section-card class="mt-6 block" title="Recent tenant onboarding" description="The operators created most recently." [padded]="false">
        <a header-actions class="vx-btn vx-btn-secondary vx-btn-sm" routerLink="/tenants">All tenants</a>
        @if (!tenantsLoading() && (tenants()?.recentTenants?.length ?? 0) === 0) {
          <vx-empty-state icon="building" title="No tenants yet" description="Operators you create will appear here." />
        } @else {
          <ul class="divide-y divide-line-subtle" data-testid="recent-tenants">
            @for (tenant of tenants()?.recentTenants ?? []; track tenant.id) {
              <li>
                <a class="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-muted" [routerLink]="['/tenants', tenant.id]">
                  <vx-avatar size="sm" [name]="tenant.name" [photoPath]="platform.logoPath(tenant.id)" [hasPhoto]="tenant.hasLogo" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-body font-medium text-ink">{{ tenant.name }}</span>
                    <span class="block truncate text-meta text-ink-muted">{{ tenant.emirate || 'Emirate not recorded' }}</span>
                  </span>
                  <vx-status-badge [status]="tenant.status" />
                  <span class="hidden w-24 text-end text-meta text-ink-muted md:inline">{{ relative(tenant.createdAtUtc) }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </vx-section-card>
    }

    <h2 class="vx-section-label mb-3 mt-8">Content</h2>

    @if (error(); as message) {
      <vx-error-state title="We could not load the summary" [message]="message" (retry)="load()" />
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <vx-metric-card label="Email templates" icon="mail" [value]="summary()?.emailTemplates ?? '—'" [loading]="loading()" context="Platform-wide, all states" />
        <vx-metric-card label="Active email templates" icon="check-circle" accent="success" [value]="summary()?.activeEmailTemplates ?? '—'" [loading]="loading()" context="Published and in use" />
        <vx-metric-card label="Report templates" icon="agreements" accent="info" [value]="summary()?.reportTemplates ?? '—'" [loading]="loading()" context="Documents and manifests" />
        <vx-metric-card
          label="Drafts & unpublished edits"
          icon="edit"
          [accent]="(summary()?.draftTemplates ?? 0) + (summary()?.templatesWithUnpublishedChanges ?? 0) > 0 ? 'warning' : 'neutral'"
          [value]="loading() ? '—' : (summary()?.draftTemplates ?? 0) + (summary()?.templatesWithUnpublishedChanges ?? 0)"
          [loading]="loading()"
          [context]="draftContext()"
        />
      </div>

      <vx-section-card class="mt-6 block" title="Recent changes" description="Templates most recently created, edited or published." [padded]="false">
        @if (!loading() && (summary()?.recentChanges?.length ?? 0) === 0) {
          <vx-empty-state icon="inbox" title="Nothing has changed yet" description="Templates you edit or publish will appear here." />
        } @else {
          <ul class="divide-y divide-line-subtle">
            @for (change of summary()?.recentChanges ?? []; track change.id) {
              <li>
                <a class="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-muted" [routerLink]="linkFor(change)">
                  <span class="flex size-9 flex-none items-center justify-center rounded-lg bg-surface-muted text-ink-muted" aria-hidden="true">
                    <vx-icon [name]="change.kind === 'Email' ? 'mail' : 'agreements'" [size]="17" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-body font-medium text-ink">{{ change.name }}</span>
                    <span class="block truncate font-mono text-meta text-ink-muted">{{ change.code }}</span>
                  </span>
                  <span class="hidden text-meta text-ink-muted sm:inline">v{{ change.currentVersion }}</span>
                  <vx-status-badge [status]="change.status" />
                  <span class="hidden w-24 text-end text-meta text-ink-muted md:inline">{{ relative(change.changedAtUtc) }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </vx-section-card>
    }
  `,
})
export class CmsDashboardPage {
  private readonly api = inject(ContentApi);
  protected readonly platform = inject(PlatformApi);

  protected readonly summary = signal<ContentSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly tenants = signal<TenantSummary | null>(null);
  protected readonly tenantsLoading = signal(true);
  protected readonly tenantsError = signal<string | null>(null);

  protected readonly relative = formatRelative;

  constructor() {
    this.load();
    this.loadTenants();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof VextoApiError ? error.message : 'We could not load the summary.');
      },
    });
  }

  protected loadTenants(): void {
    this.tenantsLoading.set(true);
    this.tenantsError.set(null);

    this.platform.summary().subscribe({
      next: (summary) => {
        this.tenants.set(summary);
        this.tenantsLoading.set(false);
      },
      error: (error: unknown) => {
        this.tenantsLoading.set(false);
        this.tenantsError.set(error instanceof VextoApiError ? error.message : 'We could not load the tenant summary.');
      },
    });
  }

  protected draftContext(): string {
    const summary = this.summary();

    if (!summary) {
      return '';
    }

    return `${summary.draftTemplates} never published · ${summary.templatesWithUnpublishedChanges} with unpublished edits`;
  }

  protected linkFor(change: RecentTemplateChange): string {
    return change.kind === 'Email' ? `/email-templates/${change.id}` : `/report-templates/${change.id}`;
  }
}
