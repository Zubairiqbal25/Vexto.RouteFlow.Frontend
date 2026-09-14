import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PhotoSource, PlatformApi, VextoApiError } from '@vexto/api-client';
import type {
  SubscriptionPlan,
  TenantAdministrator,
  TenantDetailResponse,
  TenantResponse,
  TenantSettings,
  TenantSettingsCatalogue,
  TenantSubscription,
} from '@vexto/models';
import {
  ConfirmService,
  ToastService,
  VxAttentionNote,
  VxAvatar,
  VxCardFact,
  VxErrorState,
  VxIcon,
  VxSectionCard,
  VxStatusBadge,
  type VxTab,
  VxTabs,
} from '@vexto/ui';
import { formatDate, formatMoney } from '@vexto/utilities';
import { OperatorPortalLink } from './operator-portal-link';
import { CmsTenantAdministrators } from './tenant-administrators';
import { type TenantReadiness, tenantReadiness } from './tenant-readiness';

type TabId = 'overview' | 'business' | 'settings' | 'administrators' | 'subscription';

const TABS: readonly VxTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'business', label: 'Business Details' },
  { id: 'settings', label: 'Settings' },
  { id: 'administrators', label: 'Administrators' },
  { id: 'subscription', label: 'Subscription' },
];

interface BusinessForm {
  name: string;
  legalName: string;
  tradeLicenseNumber: string;
  tradeLicenseExpiryDate: string;
  taxRegistrationNumber: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  emirate: string;
  country: string;
  postalCode: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
}

/**
 * The platform control centre for one operator.
 *
 * Everything Vexto's staff do *about* a tenant — its business record, its settings, its plan, its
 * administrators, its status and its logo — and nothing they do *inside* it. Routes, passengers,
 * drivers and trips are the operator's own screens; "Open in Operator Portal" is how a
 * ServiceAdmin reaches them, in the tenant's support context, with the API re-checking the
 * privilege on every request.
 *
 * The readiness summary on the overview is computed here from the three things the page already
 * loads (docs/tenant-onboarding.md, "Readiness"). Nothing about it is stored.
 */
@Component({
  selector: 'vexto-cms-tenant-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CmsTenantAdministrators,
    VxAttentionNote,
    VxAvatar,
    VxCardFact,
    VxErrorState,
    VxIcon,
    VxSectionCard,
    VxStatusBadge,
    VxTabs,
  ],
  template: `
    @if (error(); as message) {
      <vx-error-state title="We could not load this tenant" [message]="message" (retry)="load()" />
    } @else if (detail(); as data) {
      <header class="mb-6">
        <nav class="mb-3 flex items-center gap-1.5 text-meta text-ink-muted" aria-label="Breadcrumb">
          <a routerLink="/tenants" class="hover:text-ink">Tenants</a>
          <vx-icon name="chevron-right" [size]="13" />
          <span class="text-ink-secondary">{{ data.tenant.name }}</span>
        </nav>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-center gap-4">
            <vx-avatar size="xl" [name]="data.tenant.name" [photoPath]="logoPath()" [hasPhoto]="data.tenant.hasLogo" />
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl" data-testid="tenant-name">{{ data.tenant.name }}</h1>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <vx-status-badge [status]="data.tenant.status" />
                @if (subscription()?.planName; as plan) {
                  <span class="rounded-full border border-line px-2.5 py-0.5 text-meta font-medium text-ink-secondary" data-testid="tenant-plan">{{ plan }}</span>
                }
                <span class="text-meta text-ink-muted">{{ data.tenant.legalName }}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            @if (portal.available) {
              <button type="button" class="vx-btn vx-btn-secondary" data-testid="open-operator-portal" (click)="portal.open(data.tenant.id)">
                <vx-icon name="switch" [size]="16" />
                Open in Operator Portal
              </button>
            }
            <button type="button" class="vx-btn vx-btn-secondary" (click)="tab.set('business')">
              <vx-icon name="edit" [size]="16" />
              Edit
            </button>
            @if (data.tenant.status === 'Active') {
              <button type="button" class="vx-btn vx-btn-danger" data-testid="suspend-tenant" (click)="suspend()">Suspend</button>
            } @else if (data.tenant.status !== 'Inactive') {
              <button type="button" class="vx-btn vx-btn-primary" data-testid="activate-tenant" (click)="activate()">Activate</button>
            }
          </div>
        </div>
      </header>

      <vx-tabs class="mb-6 block" [tabs]="tabs" [active]="tab()" (selected)="selectTab($event)" />

      @switch (tab()) {
        @case ('overview') {
          <div class="grid gap-5 lg:grid-cols-3">
            <vx-section-card class="lg:col-span-2" title="Setup" [description]="readiness().complete ? 'Setup complete' : 'Needs attention'">
              <div class="mb-4 flex items-center gap-3">
                <div class="h-2 flex-1 overflow-hidden rounded-full" style="background: var(--vexto-surface-sunken)">
                  <div class="h-full rounded-full transition-[width]" [style.width.%]="readiness().percent" [style.background]="readiness().complete ? 'var(--vexto-success)' : 'var(--vexto-primary)'"></div>
                </div>
                <span class="text-body font-semibold tabular-nums text-ink" data-testid="setup-percent">Setup {{ readiness().percent }}%</span>
              </div>
              <ul class="flex flex-col gap-2" data-testid="readiness">
                @for (step of readiness().steps; track step.id) {
                  <li class="flex items-center gap-3 text-body">
                    <span
                      class="flex size-5 flex-none items-center justify-center rounded-full"
                      [style.background]="step.done ? 'var(--vexto-success-soft)' : 'var(--vexto-warning-soft)'"
                      [style.color]="step.done ? 'var(--vexto-success-text)' : 'var(--vexto-warning-text)'"
                    >
                      <vx-icon [name]="step.done ? 'check' : 'alert'" [size]="12" [strokeWidth]="3" />
                    </span>
                    <span class="text-ink">{{ step.label }}</span>
                    @if (!step.done) {
                      <span class="text-meta text-ink-muted">{{ step.hint }}</span>
                    }
                  </li>
                }
              </ul>

              @if (data.tenant.status === 'Pending' && !readiness().steps[4]!.done) {
                <vx-attention-note class="mt-4" level="info">
                  The tenant can be activated once the business details are in; an administrator can accept their invitation before or after.
                </vx-attention-note>
              }
              @for (indicator of data.tenant.health; track indicator.code) {
                <vx-attention-note class="mt-2" [level]="indicator.severity === 'Critical' ? 'critical' : indicator.severity === 'Warning' ? 'warning' : 'info'">
                  {{ indicator.message }}
                </vx-attention-note>
              }
            </vx-section-card>

            <vx-section-card title="Logo" description="JPEG, PNG or WebP, up to 5 MB.">
              <div class="flex items-center gap-4">
                <vx-avatar size="xl" [name]="data.tenant.name" [photoPath]="logoPath()" [hasPhoto]="data.tenant.hasLogo" />
                <div class="flex flex-col gap-2">
                  <label class="vx-btn vx-btn-secondary vx-btn-sm cursor-pointer">
                    <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" data-testid="logo-input" (change)="uploadLogo($event)" />
                    {{ uploadingLogo() ? 'Uploading…' : data.tenant.hasLogo ? 'Replace logo' : 'Upload logo' }}
                  </label>
                  @if (data.tenant.hasLogo) {
                    <button type="button" class="vx-btn vx-btn-ghost vx-btn-sm" (click)="removeLogo()">Remove</button>
                  }
                </div>
              </div>
            </vx-section-card>

            <vx-section-card class="lg:col-span-3" title="At a glance">
              <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <vx-card-fact label="Emirate" [value]="data.tenant.businessDetails.emirate" />
                <vx-card-fact label="Primary contact" [value]="data.tenant.businessDetails.primaryContactName" />
                <vx-card-fact label="Members" [value]="(data.tenant.members?.active ?? 0) + ' active · ' + (data.tenant.members?.invited ?? 0) + ' invited'" />
                <vx-card-fact label="Created" [value]="created(data.tenant.createdAtUtc)" />
              </div>
            </vx-section-card>
          </div>
        }

        @case ('business') {
          <vx-section-card title="Business Details" description="What is on the trade licence, and how to reach the operator.">
            @if (business(); as form) {
              <div class="vx-form-grid">
                <label class="vx-field"><span class="vx-label vx-required">Trading name</span><input class="vx-input" name="name" [value]="form.name" (input)="patchBusiness({ name: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label vx-required">Legal name</span><input class="vx-input" name="legalName" [value]="form.legalName" (input)="patchBusiness({ legalName: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label vx-required">Trade licence number</span><input class="vx-input" name="tradeLicenseNumber" [value]="form.tradeLicenseNumber" (input)="patchBusiness({ tradeLicenseNumber: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Trade licence expiry</span><input type="date" class="vx-input" name="tradeLicenseExpiryDate" [value]="form.tradeLicenseExpiryDate" (input)="patchBusiness({ tradeLicenseExpiryDate: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Tax registration number</span><input class="vx-input" name="taxRegistrationNumber" [value]="form.taxRegistrationNumber" (input)="patchBusiness({ taxRegistrationNumber: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Website</span><input class="vx-input" name="website" [value]="form.website" (input)="patchBusiness({ website: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label vx-required">Business email</span><input type="email" class="vx-input" name="email" [value]="form.email" (input)="patchBusiness({ email: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Business phone</span><input class="vx-input" name="phone" [value]="form.phone" (input)="patchBusiness({ phone: text($event) })" /></label>
              </div>

              <p class="vx-section-label mb-2 mt-6">Address</p>
              <div class="vx-form-grid">
                <label class="vx-field vx-span-2"><span class="vx-label">Address line 1</span><input class="vx-input" name="addressLine1" [value]="form.addressLine1" (input)="patchBusiness({ addressLine1: text($event) })" /></label>
                <label class="vx-field vx-span-2"><span class="vx-label">Address line 2</span><input class="vx-input" name="addressLine2" [value]="form.addressLine2" (input)="patchBusiness({ addressLine2: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">City</span><input class="vx-input" name="city" [value]="form.city" (input)="patchBusiness({ city: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Emirate</span><input class="vx-input" name="emirate" [value]="form.emirate" (input)="patchBusiness({ emirate: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Country</span><input class="vx-input" name="country" [value]="form.country" (input)="patchBusiness({ country: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Postal code</span><input class="vx-input" name="postalCode" [value]="form.postalCode" (input)="patchBusiness({ postalCode: text($event) })" /></label>
              </div>

              <p class="vx-section-label mb-2 mt-6">Primary contact</p>
              <div class="vx-form-grid">
                <label class="vx-field"><span class="vx-label">Name</span><input class="vx-input" name="primaryContactName" [value]="form.primaryContactName" (input)="patchBusiness({ primaryContactName: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Email</span><input type="email" class="vx-input" name="primaryContactEmail" [value]="form.primaryContactEmail" (input)="patchBusiness({ primaryContactEmail: text($event) })" /></label>
                <label class="vx-field"><span class="vx-label">Phone</span><input class="vx-input" name="primaryContactPhone" [value]="form.primaryContactPhone" (input)="patchBusiness({ primaryContactPhone: text($event) })" /></label>
              </div>

              @if (businessError(); as message) {
                <p class="vx-error mt-3">{{ message }}</p>
              }

              <div class="mt-5 flex justify-end gap-2">
                <button type="button" class="vx-btn vx-btn-ghost" [disabled]="savingBusiness()" (click)="resetBusiness()">Reset</button>
                <button type="button" class="vx-btn vx-btn-primary" data-testid="save-business" [disabled]="savingBusiness()" (click)="saveBusiness()">
                  {{ savingBusiness() ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            }
          </vx-section-card>
        }

        @case ('settings') {
          <vx-section-card title="Settings" description="The operator's regional preferences and passenger billing policy, set on their behalf.">
            @if (settings(); as form) {
              <div class="vx-form-grid">
                <label class="vx-field"><span class="vx-label vx-required">Time zone</span><input class="vx-input" name="timeZone" [value]="form.timeZone" (input)="patchSettings({ timeZone: text($event) })" /></label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Currency</span>
                  <select class="vx-select" name="defaultCurrency" [value]="form.defaultCurrency" (change)="patchSettings({ defaultCurrency: text($event) })">
                    @for (currency of catalogue()?.supportedCurrencies ?? [form.defaultCurrency]; track currency) {
                      <option [value]="currency">{{ currency }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Language</span>
                  <select class="vx-select" name="language" [value]="form.language" (change)="patchSettings({ language: text($event) })">
                    @for (language of catalogue()?.supportedLanguages ?? [form.language]; track language) {
                      <option [value]="language">{{ language }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Date format</span>
                  <select class="vx-select" name="dateFormat" [value]="form.dateFormat" (change)="patchSettings({ dateFormat: text($event) })">
                    @for (format of catalogue()?.supportedDateFormats ?? [form.dateFormat]; track format) {
                      <option [value]="format">{{ format }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Payment grace period (days)</span>
                  <input type="number" min="0" max="90" class="vx-input" name="gracePeriod" [value]="form.passengerPaymentGracePeriodDays" (input)="patchSettings({ passengerPaymentGracePeriodDays: number($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Passenger blocking</span>
                  <span class="flex items-start gap-2.5 pt-2">
                    <input type="checkbox" class="vx-checkbox mt-0.5" name="block" [checked]="form.blockPassengersWithOverduePayments" (change)="patchSettings({ blockPassengersWithOverduePayments: checked($event) })" />
                    <span class="text-body text-ink-secondary">Stop overdue passengers travelling once grace runs out</span>
                  </span>
                </label>
              </div>
              @if (settingsError(); as message) {
                <p class="vx-error mt-3">{{ message }}</p>
              }
              <div class="mt-5 flex justify-end gap-2">
                <button type="button" class="vx-btn vx-btn-primary" data-testid="save-settings" [disabled]="savingSettings()" (click)="saveSettings()">
                  {{ savingSettings() ? 'Saving…' : 'Save settings' }}
                </button>
              </div>
            }
          </vx-section-card>
        }

        @case ('administrators') {
          <vexto-cms-tenant-administrators [tenantId]="data.tenant.id" [administrators]="administrators()" (changed)="loadAdministrators()" />
        }

        @case ('subscription') {
          <div class="grid gap-5 lg:grid-cols-3">
            <vx-section-card class="lg:col-span-2" title="Current plan" description="What this operator is on, and how much of it they use. Over-limit is reported, never enforced.">
              @if (subscription(); as current) {
                <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <vx-card-fact label="Plan" [value]="current.planName ?? 'None'" />
                  <vx-card-fact label="Status" [value]="current.status" />
                  <vx-card-fact label="Billing" [value]="current.billingCycle ?? '—'" />
                  <vx-card-fact label="Price" [value]="current.price !== null && current.price !== undefined ? money(current.price, current.currency) + '/month' : '—'" />
                  <vx-card-fact label="Vehicles" [value]="current.usage.activeVehicles + ' of ' + allowance(current.usage.includedVehicles)" />
                  <vx-card-fact label="Passengers" [value]="current.usage.activePassengers + ' of ' + allowance(current.usage.includedPassengers)" />
                  <vx-card-fact label="Usage" [value]="current.usage.status" />
                  <vx-card-fact label="Started" [value]="current.startDate ? created(current.startDate) : '—'" />
                </div>
              }
            </vx-section-card>

            <vx-section-card title="Change plan" description="Recorded, not billed: no payment is collected here.">
              <div class="flex flex-col gap-3">
                <label class="vx-field">
                  <span class="vx-label">Plan</span>
                  <select class="vx-select" name="planCode" [value]="planChoice()" (change)="planChoice.set(text($event))">
                    <option value="">Choose a plan</option>
                    @for (plan of plans(); track plan.code) {
                      <option [value]="plan.code">{{ plan.name }} · {{ money(plan.monthlyPrice, plan.currency) }}/month</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Billing cycle</span>
                  <select class="vx-select" name="billingCycle" [value]="planCycle()" (change)="planCycle.set(text($event) === 'Yearly' ? 'Yearly' : 'Monthly')">
                    <option value="Monthly">Monthly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Status</span>
                  <select class="vx-select" name="planStatus" [value]="planStatus()" (change)="planStatus.set(text($event) === 'Active' ? 'Active' : 'Trial')">
                    <option value="Trial">Trial</option>
                    <option value="Active">Active</option>
                  </select>
                </label>
                <button type="button" class="vx-btn vx-btn-primary" data-testid="assign-plan" [disabled]="!planChoice() || assigningPlan()" (click)="assignPlan()">
                  {{ assigningPlan() ? 'Saving…' : 'Assign plan' }}
                </button>
              </div>
            </vx-section-card>
          </div>
        }
      }
    } @else {
      <div class="vx-skeleton h-64 w-full"></div>
    }
  `,
})
export class CmsTenantDetailPage {
  private readonly api = inject(PlatformApi);
  private readonly photos = inject(PhotoSource);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  protected readonly portal = inject(OperatorPortalLink);

  /** Bound from the route by `withComponentInputBinding`. */
  readonly tenantId = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly tab = signal<TabId>('overview');
  protected readonly created = formatDate;
  protected readonly money = formatMoney;

  protected readonly detail = signal<TenantDetailResponse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly administrators = signal<TenantAdministrator[]>([]);
  protected readonly subscription = signal<TenantSubscription | null>(null);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly catalogue = signal<TenantSettingsCatalogue | null>(null);

  protected readonly business = signal<BusinessForm | null>(null);
  protected readonly businessError = signal<string | null>(null);
  protected readonly savingBusiness = signal(false);

  protected readonly settings = signal<TenantSettings | null>(null);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly savingSettings = signal(false);

  protected readonly planChoice = signal('');
  protected readonly planCycle = signal<'Monthly' | 'Yearly'>('Monthly');
  protected readonly planStatus = signal<'Trial' | 'Active'>('Trial');
  protected readonly assigningPlan = signal(false);
  protected readonly uploadingLogo = signal(false);

  protected readonly administratorsSection = viewChild(CmsTenantAdministrators);

  protected readonly logoPath = computed(() => this.api.logoPath(this.tenantId()));

  protected readonly readiness = computed<TenantReadiness>(() => {
    const data = this.detail();

    return data
      ? tenantReadiness(data.tenant, this.subscription(), this.administrators())
      : { steps: [], percent: 0, complete: false };
  });

  constructor() {
    effect(() => {
      this.tenantId();
      this.load();
    });

    // A card action can deep-link straight to a section (#administrators, #business).
    const fragment = this.route.snapshot.fragment as TabId | null;

    if (fragment && TABS.some((candidate) => candidate.id === fragment)) {
      this.tab.set(fragment);
    }

    this.api.plans().subscribe({ next: (plans) => this.plans.set(plans), error: () => undefined });
    this.api.settingsCatalogue().subscribe({ next: (catalogue) => this.catalogue.set(catalogue), error: () => undefined });
  }

  protected load(): void {
    this.error.set(null);

    this.api.get(this.tenantId()).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.settings.set({ ...data.settings });
        this.resetBusiness();
      },
      error: (error: unknown) =>
        this.error.set(error instanceof VextoApiError ? error.message : 'We could not load this tenant.'),
    });

    this.loadAdministrators();
    this.api.subscription(this.tenantId()).subscribe({
      next: (subscription) => this.subscription.set(subscription),
      error: () => this.subscription.set(null),
    });
  }

  protected loadAdministrators(): void {
    this.api.administrators(this.tenantId()).subscribe({
      next: (administrators) => this.administrators.set(administrators),
      error: () => this.administrators.set([]),
    });

    // Membership counts on the tenant itself change with every invitation, so the header follows.
    this.api.get(this.tenantId()).subscribe({ next: (data) => this.detail.set(data), error: () => undefined });
  }

  protected selectTab(id: string): void {
    if (TABS.some((tab) => tab.id === id)) {
      this.tab.set(id as TabId);
    }
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected number(event: Event): number {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

    return Number.isNaN(parsed) ? 0 : parsed;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected allowance(included: number): string {
    return included > 0 ? String(included) : 'unlimited';
  }

  /* Status ----------------------------------------------------------------------------------- */

  protected activate(): void {
    const tenant = this.detail()?.tenant;

    if (!tenant) {
      return;
    }

    this.api.activate(tenant.id).subscribe({
      next: (updated) => {
        this.toast.success(`${updated.name} is active.`);
        this.apply(updated);
      },
      error: (error: unknown) => this.toast.error(error instanceof VextoApiError ? error.message : 'We could not activate this tenant.'),
    });
  }

  protected async suspend(): Promise<void> {
    const tenant = this.detail()?.tenant;

    if (!tenant) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: 'Suspend this tenant?',
      message: `Everybody at ${tenant.name} will be unable to sign in until it is reactivated.`,
      confirmLabel: 'Suspend tenant',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    this.api.suspend(tenant.id).subscribe({
      next: (updated) => {
        this.toast.success(`${updated.name} suspended.`);
        this.apply(updated);
      },
      error: () => this.toast.error('We could not suspend this tenant.'),
    });
  }

  /* Business ----------------------------------------------------------------------------------- */

  protected resetBusiness(): void {
    const tenant = this.detail()?.tenant;

    if (!tenant) {
      return;
    }

    const details = tenant.businessDetails;

    this.business.set({
      name: tenant.name,
      legalName: tenant.legalName,
      tradeLicenseNumber: tenant.tradeLicenseNumber,
      tradeLicenseExpiryDate: tenant.tradeLicenseExpiryDate ?? '',
      taxRegistrationNumber: tenant.taxRegistrationNumber ?? '',
      email: tenant.email,
      phone: tenant.phone ?? '',
      website: tenant.website ?? '',
      addressLine1: details.addressLine1 ?? '',
      addressLine2: details.addressLine2 ?? '',
      city: details.city ?? '',
      emirate: details.emirate ?? '',
      country: details.country ?? '',
      postalCode: details.postalCode ?? '',
      primaryContactName: details.primaryContactName ?? '',
      primaryContactEmail: details.primaryContactEmail ?? '',
      primaryContactPhone: details.primaryContactPhone ?? '',
    });
    this.businessError.set(null);
  }

  protected patchBusiness(change: Partial<BusinessForm>): void {
    this.business.update((current) => (current ? { ...current, ...change } : current));
    this.businessError.set(null);
  }

  protected saveBusiness(): void {
    const form = this.business();
    const tenant = this.detail()?.tenant;

    if (!form || !tenant) {
      return;
    }

    if (!form.name.trim() || !form.legalName.trim() || !form.tradeLicenseNumber.trim() || !form.email.trim()) {
      this.businessError.set('Trading name, legal name, trade licence number and business email are required.');

      return;
    }

    const clean = (value: string): string | null => value.trim() || null;

    this.savingBusiness.set(true);

    this.api
      .update(tenant.id, {
        tenantId: tenant.id,
        name: form.name.trim(),
        legalName: form.legalName.trim(),
        tradeLicenseNumber: form.tradeLicenseNumber.trim(),
        tradeLicenseExpiryDate: form.tradeLicenseExpiryDate || null,
        taxRegistrationNumber: clean(form.taxRegistrationNumber),
        email: form.email.trim(),
        phone: clean(form.phone),
        website: clean(form.website),
        businessDetails: {
          addressLine1: clean(form.addressLine1),
          addressLine2: clean(form.addressLine2),
          city: clean(form.city),
          emirate: clean(form.emirate),
          country: clean(form.country),
          postalCode: clean(form.postalCode),
          primaryContactName: clean(form.primaryContactName),
          primaryContactEmail: clean(form.primaryContactEmail),
          primaryContactPhone: clean(form.primaryContactPhone),
        },
      })
      .subscribe({
        next: (updated) => {
          this.savingBusiness.set(false);
          this.toast.success('Business details saved.');
          this.apply(updated);
        },
        error: (error: unknown) => {
          this.savingBusiness.set(false);
          this.businessError.set(error instanceof VextoApiError ? error.message : 'We could not save the business details.');
        },
      });
  }

  /* Settings ----------------------------------------------------------------------------------- */

  protected patchSettings(change: Partial<TenantSettings>): void {
    this.settings.update((current) => (current ? { ...current, ...change } : current));
    this.settingsError.set(null);
  }

  protected saveSettings(): void {
    const form = this.settings();
    const tenant = this.detail()?.tenant;

    if (!form || !tenant) {
      return;
    }

    this.savingSettings.set(true);

    this.api
      .updateSettings(tenant.id, {
        timeZone: form.timeZone,
        defaultCurrency: form.defaultCurrency,
        dateFormat: form.dateFormat,
        language: form.language,
        passengerPaymentGracePeriodDays: form.passengerPaymentGracePeriodDays,
        blockPassengersWithOverduePayments: form.blockPassengersWithOverduePayments,
      })
      .subscribe({
        next: (saved) => {
          this.savingSettings.set(false);
          this.settings.set({ ...saved });
          this.toast.success('Settings saved.');
        },
        error: (error: unknown) => {
          this.savingSettings.set(false);
          this.settingsError.set(error instanceof VextoApiError ? error.message : 'We could not save the settings.');
        },
      });
  }

  /* Plan ----------------------------------------------------------------------------------- */

  protected assignPlan(): void {
    const tenant = this.detail()?.tenant;
    const code = this.planChoice();

    if (!tenant || !code) {
      return;
    }

    this.assigningPlan.set(true);

    this.api
      .assignPlan(tenant.id, { planCode: code, billingCycle: this.planCycle(), price: null, status: this.planStatus(), startDate: null })
      .subscribe({
        next: () => {
          this.assigningPlan.set(false);
          this.toast.success('Plan assigned.');
          this.api.subscription(tenant.id).subscribe({ next: (subscription) => this.subscription.set(subscription), error: () => undefined });
        },
        error: (error: unknown) => {
          this.assigningPlan.set(false);
          this.toast.error(error instanceof VextoApiError ? error.message : 'We could not assign the plan.');
        },
      });
  }

  /* Logo ----------------------------------------------------------------------------------- */

  protected uploadLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const tenant = this.detail()?.tenant;

    if (!file || !tenant) {
      return;
    }

    this.uploadingLogo.set(true);

    this.api.uploadLogo(tenant.id, file).subscribe({
      next: (updated) => {
        this.uploadingLogo.set(false);
        this.photos.invalidate(this.logoPath());
        this.toast.success('Logo updated.');
        this.apply(updated);
        input.value = '';
      },
      error: (error: unknown) => {
        this.uploadingLogo.set(false);
        this.toast.error(error instanceof VextoApiError ? error.message : 'We could not upload the logo.');
        input.value = '';
      },
    });
  }

  protected removeLogo(): void {
    const tenant = this.detail()?.tenant;

    if (!tenant) {
      return;
    }

    this.api.removeLogo(tenant.id).subscribe({
      next: (updated) => {
        this.photos.invalidate(this.logoPath());
        this.toast.success('Logo removed.');
        this.apply(updated);
      },
      error: () => this.toast.error('We could not remove the logo.'),
    });
  }

  /** Folds a tenant response back into the detail, keeping the settings and counts already loaded. */
  private apply(updated: TenantResponse): void {
    this.detail.update((current) =>
      current ? { ...current, tenant: { ...updated, members: updated.members ?? current.tenant.members } } : current,
    );
  }
}
