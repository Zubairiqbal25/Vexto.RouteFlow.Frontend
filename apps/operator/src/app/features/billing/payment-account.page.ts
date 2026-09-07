import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PaymentAccountApi, VextoApiError } from '@vexto/api-client';
import type { PaymentAccount, TenantPaymentSettings } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import {
  ToastService,
  VxErrorState,
  VxIcon,
  VxPageHeader,
  VxSkeleton,
  VxStatusBadge,
} from '@vexto/ui';
import { formatRelative } from '@vexto/utilities';

/**
 * Connecting the operator to the payment provider, and deciding whether passengers may pay online.
 *
 * **The provider account id is not on this page.** Vexto creates the account and owns the
 * relationship: there is nothing for an operator to type, and an identifier on a dashboard is one
 * that ends up in a screenshot in a support ticket. Somebody who genuinely needs it for provider
 * support can be given it; nobody needs it here.
 */
@Component({
  selector: 'vexto-payment-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxErrorState, VxIcon, VxPageHeader, VxSkeleton, VxStatusBadge],
  template: `
    <vx-page-header
      title="Payment account"
      description="How passenger fares reach this operator's bank account."
    />

    @if (error(); as message) {
      <vx-error-state title="We could not load your payment account" [message]="message" (retry)="load()" />
    } @else if (loading()) {
      <vx-skeleton height="14rem" />
    } @else if (account(); as state) {
      <section class="vx-card p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="vx-section-label">Status</p>
            <div class="mt-1.5 flex items-center gap-3">
              <vx-status-badge [tone]="tone()" [label]="statusLabel()" />

              @if (state.stateRefreshedAtUtc; as refreshed) {
                <span class="text-meta text-ink-muted">Checked {{ relative(refreshed) }}</span>
              }
            </div>
          </div>

          @if (canManage()) {
            <div class="flex flex-wrap gap-2">
              @if (!state.isConnected) {
                <button type="button" class="vx-btn vx-btn-primary" [disabled]="busy()" (click)="connect()">
                  {{ busy() ? 'Connecting…' : 'Connect payments' }}
                </button>
              } @else {
                @if (!state.chargesEnabled || !state.detailsSubmitted) {
                  <button type="button" class="vx-btn vx-btn-primary" [disabled]="busy()" (click)="onboard()">
                    Complete onboarding
                  </button>
                }
                <button type="button" class="vx-btn vx-btn-secondary" [disabled]="busy()" (click)="refresh()">
                  Refresh status
                </button>
              }
            </div>
          }
        </div>

        @if (!state.isConnected) {
          <p class="mt-5 text-body text-ink-secondary">
            Passengers cannot pay through the app until this operator has an account with the
            payment provider. Fares are settled directly to you — Vexto never holds your money.
          </p>
        } @else {
          <dl class="mt-6 grid gap-5 sm:grid-cols-3">
            <div>
              <dt class="vx-section-label">Can take payments</dt>
              <dd class="mt-1 flex items-center gap-2 text-body font-medium text-ink">
                <vx-icon [name]="state.chargesEnabled ? 'check-circle' : 'alert'" [size]="18" />
                {{ state.chargesEnabled ? 'Yes' : 'Not yet' }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Can receive payouts</dt>
              <dd class="mt-1 flex items-center gap-2 text-body font-medium text-ink">
                <vx-icon [name]="state.payoutsEnabled ? 'check-circle' : 'alert'" [size]="18" />
                {{ state.payoutsEnabled ? 'Yes' : 'Not yet' }}
              </dd>
            </div>
            <div>
              <dt class="vx-section-label">Details submitted</dt>
              <dd class="mt-1 flex items-center gap-2 text-body font-medium text-ink">
                <vx-icon [name]="state.detailsSubmitted ? 'check-circle' : 'alert'" [size]="18" />
                {{ state.detailsSubmitted ? 'Yes' : 'Not yet' }}
              </dd>
            </div>
          </dl>

          @if (!state.chargesEnabled) {
            <p class="mt-5 text-meta text-ink-muted">
              The provider needs more information before this account can take payments. Complete
              onboarding to give it to them — Vexto never sees your bank or identity documents.
            </p>
          }
        }
      </section>

      @if (settings(); as configuration) {
        <section class="vx-card mt-5 p-6">
          <p class="vx-section-label">Online payments</p>

          <div class="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p class="max-w-xl text-body text-ink-secondary">
              When this is on, passengers see a Pay button on their own invoices. Off by default,
              so connecting an account does not by itself start asking people for money.
            </p>

            @if (canManage()) {
              <button
                type="button"
                class="vx-btn"
                [class.vx-btn-primary]="!configuration.onlinePaymentsEnabled"
                [class.vx-btn-secondary]="configuration.onlinePaymentsEnabled"
                [disabled]="busy() || !state.chargesEnabled"
                (click)="toggleOnlinePayments(configuration)"
              >
                {{ configuration.onlinePaymentsEnabled ? 'Turn off' : 'Turn on' }}
              </button>
            }
          </div>

          @if (!state.chargesEnabled) {
            <p class="mt-3 text-meta text-ink-muted">
              Available once the provider can take payments for this account.
            </p>
          }

          <p class="mt-5 text-meta text-ink-muted">
            Vexto platform fee: <span class="font-medium text-ink">{{ feeLabel(configuration) }}</span>.
          </p>
        </section>
      }
    }
  `,
})
export class PaymentAccountPage {
  private readonly api = inject(PaymentAccountApi);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);

  protected readonly relative = formatRelative;

  protected readonly account = signal<PaymentAccount | null>(null);
  protected readonly settings = signal<TenantPaymentSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canManage = computed(() =>
    this.permissions.has(VextoPermissions.Payments.Manage));

  protected readonly tone = computed(() => {
    const state = this.account();

    if (!state?.isConnected) {
      return 'neutral' as const;
    }

    if (state.chargesEnabled && state.payoutsEnabled) {
      return 'success' as const;
    }

    return state.status === 'Disabled' ? ('danger' as const) : ('warning' as const);
  });

  protected readonly statusLabel = computed(() => {
    const state = this.account();

    if (!state?.isConnected) {
      return 'Not connected';
    }

    switch (state.status) {
      case 'Active':
        return 'Active';
      case 'Restricted':
        return 'Needs attention';
      case 'Disabled':
        return 'Disabled by provider';
      default:
        return 'Onboarding';
    }
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.get().subscribe({
      next: (account) => {
        this.account.set(account);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);

        this.error.set(
          error instanceof VextoApiError ? error.message : 'We could not reach the server.',
        );
      },
    });

    // Independently, so that a settings failure does not hide the account status — which is the
    // part an operator opening this page is usually here to check.
    this.api.settings().subscribe({
      next: (settings) => this.settings.set(settings),
      error: () => this.settings.set(null),
    });
  }

  protected connect(): void {
    this.busy.set(true);

    this.api.connect().subscribe({
      next: (account) => {
        this.busy.set(false);
        this.account.set(account);
        this.toast.success('Payment account created.');

        // Straight on to the provider: an operator who has just pressed Connect is ready to give
        // the provider what it needs, and a second click to get there loses most of them.
        this.onboard();
      },
      error: (error: unknown) => this.fail(error, 'We could not create your payment account.'),
    });
  }

  protected onboard(): void {
    this.busy.set(true);

    const returnUrl = `${window.location.origin}/billing/account`;

    this.api.onboardingLink(returnUrl, returnUrl).subscribe({
      next: (link) => {
        this.busy.set(false);

        // A full navigation rather than a new tab. The provider sends the operator back here when
        // they finish, and a popup blocker must not be what stands between them and taking fares.
        window.location.assign(link.url);
      },
      error: (error: unknown) => this.fail(error, 'We could not open the provider onboarding.'),
    });
  }

  protected refresh(): void {
    this.busy.set(true);

    this.api.refresh().subscribe({
      next: (account) => {
        this.busy.set(false);
        this.account.set(account);
        this.toast.success('Status refreshed.');
      },
      error: (error: unknown) => this.fail(error, 'The payment provider could not be reached.'),
    });
  }

  protected toggleOnlinePayments(current: TenantPaymentSettings): void {
    this.busy.set(true);

    this.api
      .updateSettings({
        platformFeeType: current.platformFeeType,
        platformFeeValue: current.platformFeeValue,
        whoPaysProcessingFee: current.whoPaysProcessingFee,
        onlinePaymentsEnabled: !current.onlinePaymentsEnabled,
      })
      .subscribe({
        next: (settings) => {
          this.busy.set(false);
          this.settings.set(settings);

          this.toast.success(
            settings.onlinePaymentsEnabled
              ? 'Passengers can now pay online.'
              : 'Online payments turned off.',
          );
        },
        error: (error: unknown) => this.fail(error, 'We could not change that setting.'),
      });
  }

  protected feeLabel(settings: TenantPaymentSettings): string {
    switch (settings.platformFeeType) {
      case 'Percentage':
        return `${settings.platformFeeValue}% of each payment`;
      case 'Fixed':
        return `${settings.platformFeeValue} per payment`;
      default:
        return 'None';
    }
  }

  private fail(error: unknown, fallback: string): void {
    this.busy.set(false);

    this.toast.error(error instanceof VextoApiError ? error.message : fallback);
  }
}
