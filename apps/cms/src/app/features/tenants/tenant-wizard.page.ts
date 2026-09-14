import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformApi, VextoApiError } from '@vexto/api-client';
import type { SubscriptionPlan, TenantOnboardingResult, TenantSettingsCatalogue } from '@vexto/models';
import { ToastService, VxCardFact, VxIcon, VxSectionCard } from '@vexto/ui';
import { formatMoney } from '@vexto/utilities';
import { OperatorPortalLink } from './operator-portal-link';
import { EMIRATES } from './tenants.page';

/** The wizard's own model. Flat and plain; it becomes the API command only at the end. */
export interface TenantDraft {
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

  timeZone: string;
  defaultCurrency: string;
  language: string;
  dateFormat: string;
  passengerPaymentGracePeriodDays: number;
  blockPassengersWithOverduePayments: boolean;

  planCode: string;
  billingCycle: 'Monthly' | 'Yearly';
  subscriptionStatus: 'Trial' | 'Active';

  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  adminRole: 'TenantOwner' | 'TenantAdmin';

  activateImmediately: boolean;
}

interface StepDefinition {
  readonly id: 'business' | 'contact' | 'settings' | 'plan' | 'admin' | 'review';
  readonly title: string;
  readonly description: string;
}

export const WIZARD_STEPS: readonly StepDefinition[] = [
  { id: 'business', title: 'Business Details', description: 'Who the operator is, on paper.' },
  { id: 'contact', title: 'Contact Details', description: 'Where they are and who Vexto talks to.' },
  { id: 'settings', title: 'Tenant Settings', description: 'Time zone, currency and passenger billing policy.' },
  { id: 'plan', title: 'Subscription', description: 'The Vexto plan they start on.' },
  { id: 'admin', title: 'Tenant Admin', description: 'The first administrator, invited by email.' },
  { id: 'review', title: 'Review & Create', description: 'Check everything before creating.' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Validates one step of the draft. Exported so the rules are unit-tested without a component.
 *
 * Only what the API insists on blocks progress: the business identity, a well-formed contact
 * email if one is typed, sane settings, and — if an administrator is named at all — a complete
 * one. Everything else can be filled in over the following days from the tenant record.
 */
export function validateStep(stepId: StepDefinition['id'], draft: TenantDraft): string | null {
  switch (stepId) {
    case 'business':
      if (!draft.name.trim()) {
        return 'A trading name is required.';
      }

      if (!draft.legalName.trim()) {
        return 'The legal name on the trade licence is required.';
      }

      if (!draft.tradeLicenseNumber.trim()) {
        return 'A trade licence number is required.';
      }

      if (!draft.tradeLicenseExpiryDate) {
        return 'The trade licence expiry date is required.';
      }

      if (!EMAIL.test(draft.email.trim())) {
        return 'A valid business email is required.';
      }

      if (!draft.phone.trim()) {
        return 'A business phone number is required.';
      }

      return null;

    case 'contact':
      if (!draft.primaryContactName.trim()) {
        return 'A primary contact name is required.';
      }

      if (draft.primaryContactEmail.trim() && !EMAIL.test(draft.primaryContactEmail.trim())) {
        return 'The primary contact email does not look like an email address.';
      }

      return null;

    case 'settings':
      if (!draft.timeZone.trim() || !draft.defaultCurrency.trim()) {
        return 'A time zone and a currency are required.';
      }

      if (draft.passengerPaymentGracePeriodDays < 0 || draft.passengerPaymentGracePeriodDays > 90) {
        return 'The grace period must be between 0 and 90 days.';
      }

      return null;

    case 'admin': {
      const email = draft.adminEmail.trim();
      const named = `${draft.adminFirstName}${draft.adminLastName}`.trim().length > 0;

      if (!email) {
        return named ? 'Add an email address so the administrator can be invited.' : null;
      }

      if (!EMAIL.test(email)) {
        return 'That does not look like an email address.';
      }

      if (!draft.adminFirstName.trim() || !draft.adminLastName.trim()) {
        return 'Add the administrator’s first and last name.';
      }

      return null;
    }

    default:
      return null;
  }
}

/**
 * Onboarding a transport operator from the CMS, as a six-step wizard.
 *
 * **Nothing is written until Create Tenant.** The draft lives in this component; the server creates
 * the tenant, its settings, its plan and its administrator's invitation in one transaction when the
 * review step is submitted, so there is never a half-created operator to clean up after an
 * abandoned wizard. The Create button is disabled while the request is in flight, and the success
 * screen replaces the form so a double click cannot submit twice.
 *
 * **Defaults come from the server.** The settings step loads the platform's `Tenancy:Defaults`
 * and the allowed currencies, languages and date formats from the API; "Asia/Dubai" and "AED" are
 * not typed anywhere in this file.
 *
 * **The administrator is invited, never given a password.** Vexto is passwordless: the person
 * receives a link that activates their account, and every sign-in afterwards is an emailed code.
 */
@Component({
  selector: 'vexto-cms-tenant-wizard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxCardFact, VxIcon, VxSectionCard],
  template: `
    @if (created(); as result) {
      <div class="mx-auto max-w-xl py-10 text-center" data-testid="onboarding-success">
        <span
          class="mx-auto mb-5 flex size-14 items-center justify-center rounded-full"
          style="background: var(--vexto-success-soft); color: var(--vexto-success-text)"
        >
          <vx-icon name="check-circle" [size]="28" />
        </span>

        <h1 class="text-xl font-semibold tracking-tight text-ink">{{ result.tenant.tenant.name }} has been created.</h1>

        <dl class="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-x-6 gap-y-3 text-start">
          <dt class="text-meta text-ink-muted">Tenant status</dt>
          <dd class="text-body font-medium text-ink">{{ result.tenant.tenant.status }}</dd>

          <dt class="text-meta text-ink-muted">Plan</dt>
          <dd class="text-body font-medium text-ink">{{ selectedPlan()?.name ?? 'Not assigned' }}</dd>

          <dt class="text-meta text-ink-muted">Tenant Admin</dt>
          <dd class="text-body font-medium text-ink">{{ draft().adminEmail || 'None yet' }}</dd>

          <dt class="text-meta text-ink-muted">Invitation</dt>
          <dd class="text-body font-medium" [style.color]="deliveryColour(result)" data-testid="invitation-delivery">
            {{ deliveryLabel(result) }}
          </dd>
        </dl>

        @if (result.tenant.ownerInvitationDelivery === 'Failed') {
          <p class="vx-error mx-auto mt-4 max-w-sm">
            Invitation delivery failed. The tenant and the invitation exist; re-send it once email is working.
          </p>
        }

        <div class="mt-8 flex flex-col gap-2">
          <a class="vx-btn vx-btn-primary" [routerLink]="['/tenants', result.tenant.tenant.id]">Open Tenant</a>
          @if (result.tenant.ownerUserId) {
            <button type="button" class="vx-btn vx-btn-secondary" [disabled]="resending()" (click)="resend(result)">
              {{ resending() ? 'Sending…' : 'Resend Invitation' }}
            </button>
          }
          @if (portal.available) {
            <button type="button" class="vx-btn vx-btn-secondary" (click)="portal.open(result.tenant.tenant.id)">
              Switch to Tenant
            </button>
          }
          <a class="vx-btn vx-btn-ghost" routerLink="/tenants">Back to Tenants</a>
        </div>
      </div>
    } @else {
      <div class="mx-auto max-w-3xl">
        <header class="mb-6">
          <a routerLink="/tenants" class="mb-3 inline-flex items-center gap-1.5 text-body text-ink-muted hover:text-ink">
            <vx-icon name="arrow-left" [size]="16" />
            Tenants
          </a>
          <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Create tenant</h1>
        </header>

        <ol class="mb-6 flex flex-wrap gap-x-2 gap-y-3" aria-label="Setup steps">
          @for (step of steps; track step.id; let index = $index) {
            <li class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-2 rounded-full px-3 py-1.5 text-meta font-medium transition-colors"
                [style.background]="index === current() ? 'var(--vexto-primary-soft)' : index < current() ? 'var(--vexto-surface-muted)' : 'transparent'"
                [style.color]="index === current() ? 'var(--vexto-primary-active)' : index < current() ? 'var(--vexto-text-secondary)' : 'var(--vexto-text-muted)'"
                [disabled]="index > furthest()"
                [attr.aria-current]="index === current() ? 'step' : null"
                (click)="goTo(index)"
              >
                <span
                  class="flex size-5 flex-none items-center justify-center rounded-full text-[0.625rem]"
                  [style.background]="index < current() ? 'var(--vexto-success)' : 'var(--vexto-border-strong)'"
                  [style.color]="'var(--vexto-on-status)'"
                >
                  @if (index < current()) {
                    <vx-icon name="check" [size]="11" [strokeWidth]="3" />
                  } @else {
                    {{ index + 1 }}
                  }
                </span>
                {{ step.title }}
              </button>
              @if (index < steps.length - 1) {
                <span class="hidden h-px w-4 sm:block" style="background: var(--vexto-border)"></span>
              }
            </li>
          }
        </ol>

        <vx-section-card [title]="steps[current()]!.title" [description]="steps[current()]!.description">
          @switch (steps[current()]!.id) {
            @case ('business') {
              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label vx-required">Trading name</span>
                  <input class="vx-input" name="name" [value]="draft().name" (input)="patch({ name: text($event) })" />
                  <span class="vx-help">What passengers and staff see. e.g. Al Noor Transport</span>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Legal name</span>
                  <input class="vx-input" name="legalName" [value]="draft().legalName" (input)="patch({ legalName: text($event) })" />
                  <span class="vx-help">Exactly as it appears on the trade licence.</span>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Trade licence number</span>
                  <input class="vx-input" name="tradeLicenseNumber" [value]="draft().tradeLicenseNumber" (input)="patch({ tradeLicenseNumber: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Trade licence expiry</span>
                  <input type="date" class="vx-input" name="tradeLicenseExpiryDate" [value]="draft().tradeLicenseExpiryDate" (input)="patch({ tradeLicenseExpiryDate: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Tax registration number</span>
                  <input class="vx-input" name="taxRegistrationNumber" [value]="draft().taxRegistrationNumber" (input)="patch({ taxRegistrationNumber: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Website</span>
                  <input class="vx-input" name="website" placeholder="https://" [value]="draft().website" (input)="patch({ website: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Business email</span>
                  <input type="email" class="vx-input" name="email" [value]="draft().email" (input)="patch({ email: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Business phone</span>
                  <input class="vx-input" name="phone" [value]="draft().phone" (input)="patch({ phone: text($event) })" />
                </label>
              </div>
            }

            @case ('contact') {
              <p class="vx-section-label mb-2">Address</p>
              <div class="vx-form-grid">
                <label class="vx-field vx-span-2">
                  <span class="vx-label">Address line 1</span>
                  <input class="vx-input" name="addressLine1" [value]="draft().addressLine1" (input)="patch({ addressLine1: text($event) })" />
                </label>
                <label class="vx-field vx-span-2">
                  <span class="vx-label">Address line 2</span>
                  <input class="vx-input" name="addressLine2" [value]="draft().addressLine2" (input)="patch({ addressLine2: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">City</span>
                  <input class="vx-input" name="city" [value]="draft().city" (input)="patch({ city: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Emirate</span>
                  <input class="vx-input" name="emirate" list="cms-emirates" [value]="draft().emirate" (input)="patch({ emirate: text($event) })" />
                  <datalist id="cms-emirates">
                    @for (emirate of emirates; track emirate) {
                      <option [value]="emirate"></option>
                    }
                  </datalist>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Country</span>
                  <input class="vx-input" name="country" [value]="draft().country" (input)="patch({ country: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Postal code</span>
                  <input class="vx-input" name="postalCode" [value]="draft().postalCode" (input)="patch({ postalCode: text($event) })" />
                </label>
              </div>

              <p class="vx-section-label mb-2 mt-6">Primary contact</p>
              <p class="mb-4 text-body text-ink-secondary">
                The person Vexto telephones about this account. This is not a login.
              </p>
              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label vx-required">Name</span>
                  <input class="vx-input" name="primaryContactName" [value]="draft().primaryContactName" (input)="patch({ primaryContactName: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Email</span>
                  <input type="email" class="vx-input" name="primaryContactEmail" [value]="draft().primaryContactEmail" (input)="patch({ primaryContactEmail: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Phone</span>
                  <input class="vx-input" name="primaryContactPhone" [value]="draft().primaryContactPhone" (input)="patch({ primaryContactPhone: text($event) })" />
                </label>
              </div>
            }

            @case ('settings') {
              @if (catalogueError(); as message) {
                <p class="vx-error mb-4">{{ message }}</p>
              }
              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label vx-required">Time zone</span>
                  <input class="vx-input" name="timeZone" [value]="draft().timeZone" (input)="patch({ timeZone: text($event) })" />
                  <span class="vx-help">An IANA identifier. Every departure time is read in this zone.</span>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Currency</span>
                  <select class="vx-select" name="defaultCurrency" [value]="draft().defaultCurrency" (change)="patch({ defaultCurrency: text($event) })">
                    @for (currency of catalogue()?.supportedCurrencies ?? [draft().defaultCurrency]; track currency) {
                      <option [value]="currency">{{ currency }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Language</span>
                  <select class="vx-select" name="language" [value]="draft().language" (change)="patch({ language: text($event) })">
                    @for (language of catalogue()?.supportedLanguages ?? [draft().language]; track language) {
                      <option [value]="language">{{ language }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label vx-required">Date format</span>
                  <select class="vx-select" name="dateFormat" [value]="draft().dateFormat" (change)="patch({ dateFormat: text($event) })">
                    @for (format of catalogue()?.supportedDateFormats ?? [draft().dateFormat]; track format) {
                      <option [value]="format">{{ format }}</option>
                    }
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Payment grace period (days)</span>
                  <input type="number" min="0" max="90" class="vx-input" name="gracePeriod" [value]="draft().passengerPaymentGracePeriodDays" (input)="patch({ passengerPaymentGracePeriodDays: number($event) })" />
                  <span class="vx-help">How long a passenger keeps travelling after an invoice falls due.</span>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Passenger blocking</span>
                  <span class="flex items-start gap-2.5 pt-2">
                    <input type="checkbox" class="vx-checkbox mt-0.5" name="block" [checked]="draft().blockPassengersWithOverduePayments" (change)="patch({ blockPassengersWithOverduePayments: checked($event) })" />
                    <span class="text-body text-ink-secondary">Stop overdue passengers travelling once grace runs out</span>
                  </span>
                  <span class="vx-help">Off means they are flagged and still carried. Either way they can sign in to pay.</span>
                </label>
              </div>
            }

            @case ('plan') {
              @if (plansError(); as message) {
                <p class="vx-error mb-4">{{ message }}</p>
              }
              <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Subscription plan">
                <button
                  type="button"
                  role="radio"
                  class="vx-card p-4 text-start transition-colors"
                  [attr.aria-checked]="draft().planCode === ''"
                  [style.border-color]="draft().planCode === '' ? 'var(--vexto-primary)' : null"
                  (click)="patch({ planCode: '' })"
                >
                  <span class="block text-body font-semibold text-ink">Decide later</span>
                  <span class="mt-1 block text-meta text-ink-muted">Create the tenant without a plan and assign one from the tenant record.</span>
                </button>
                @for (plan of plans(); track plan.code) {
                  <button
                    type="button"
                    role="radio"
                    class="vx-card p-4 text-start transition-colors"
                    [attr.data-testid]="'plan-' + plan.code"
                    [attr.aria-checked]="draft().planCode === plan.code"
                    [style.border-color]="draft().planCode === plan.code ? 'var(--vexto-primary)' : null"
                    (click)="patch({ planCode: plan.code })"
                  >
                    <span class="flex items-baseline justify-between gap-2">
                      <span class="text-body font-semibold text-ink">{{ plan.name }}</span>
                      <span class="text-body font-semibold tabular-nums text-ink">{{ price(plan) }}<span class="text-meta font-normal text-ink-muted">/month</span></span>
                    </span>
                    @if (plan.description) {
                      <span class="mt-1 block text-meta text-ink-muted">{{ plan.description }}</span>
                    }
                    <span class="mt-3 grid grid-cols-3 gap-2 text-meta text-ink-secondary">
                      <span>{{ allowance(plan.includedVehicles) }} vehicles</span>
                      <span>{{ allowance(plan.includedPassengers) }} passengers</span>
                      <span>{{ extra(plan) }} / extra passenger</span>
                    </span>
                  </button>
                }
              </div>

              @if (draft().planCode) {
                <div class="vx-form-grid mt-5">
                  <label class="vx-field">
                    <span class="vx-label">Billing cycle</span>
                    <select class="vx-select" name="billingCycle" [value]="draft().billingCycle" (change)="patch({ billingCycle: cycle($event) })">
                      <option value="Monthly">Monthly</option>
                      <option value="Yearly">Yearly</option>
                    </select>
                  </label>
                  <label class="vx-field">
                    <span class="vx-label">Starts as</span>
                    <select class="vx-select" name="subscriptionStatus" [value]="draft().subscriptionStatus" (change)="patch({ subscriptionStatus: subscriptionStatus($event) })">
                      <option value="Trial">Trial</option>
                      <option value="Active">Active</option>
                    </select>
                    <span class="vx-help">No payment is collected here; the subscription is recorded, not billed.</span>
                  </label>
                </div>
              }
            }

            @case ('admin') {
              <p class="mb-4 text-body text-ink-secondary">
                They receive an invitation link that activates their account. There is no password;
                sign-in is by a code sent to this email. Leave the step blank to invite somebody later.
              </p>
              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label">First name</span>
                  <input class="vx-input" name="adminFirstName" [value]="draft().adminFirstName" (input)="patch({ adminFirstName: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Last name</span>
                  <input class="vx-input" name="adminLastName" [value]="draft().adminLastName" (input)="patch({ adminLastName: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Email</span>
                  <input type="email" class="vx-input" name="adminEmail" [value]="draft().adminEmail" (input)="patch({ adminEmail: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Phone</span>
                  <input class="vx-input" name="adminPhone" [value]="draft().adminPhone" (input)="patch({ adminPhone: text($event) })" />
                </label>
                <label class="vx-field">
                  <span class="vx-label">Role</span>
                  <select class="vx-select" name="adminRole" [value]="draft().adminRole" (change)="patch({ adminRole: role($event) })">
                    <option value="TenantOwner">Tenant Owner</option>
                    <option value="TenantAdmin">Tenant Admin</option>
                  </select>
                </label>
                <label class="vx-field">
                  <span class="vx-label">Activation</span>
                  <span class="flex items-start gap-2.5 pt-2">
                    <input type="checkbox" class="vx-checkbox mt-0.5" name="activateImmediately" [checked]="draft().activateImmediately" (change)="patch({ activateImmediately: checked($event) })" />
                    <span class="text-body text-ink-secondary">Activate the tenant straight away</span>
                  </span>
                  <span class="vx-help">Leave off to create it as Pending and activate from the tenant record.</span>
                </label>
              </div>
            }

            @case ('review') {
              <div class="flex flex-col gap-5" data-testid="review">
                <div>
                  <p class="vx-section-label mb-2">Business</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Trading name" [value]="draft().name" />
                    <vx-card-fact label="Legal name" [value]="draft().legalName" />
                    <vx-card-fact label="Trade licence" [value]="draft().tradeLicenseNumber" />
                    <vx-card-fact label="Licence expiry" [value]="draft().tradeLicenseExpiryDate" />
                    <vx-card-fact label="Business email" [value]="draft().email" />
                    <vx-card-fact label="Business phone" [value]="draft().phone" />
                  </div>
                </div>
                <div>
                  <p class="vx-section-label mb-2">Contact</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Primary contact" [value]="draft().primaryContactName" />
                    <vx-card-fact label="Location" [value]="locationSummary()" />
                  </div>
                </div>
                <div>
                  <p class="vx-section-label mb-2">Settings</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Time zone" [value]="draft().timeZone" />
                    <vx-card-fact label="Currency" [value]="draft().defaultCurrency" />
                    <vx-card-fact label="Grace period" [value]="draft().passengerPaymentGracePeriodDays + ' days'" />
                    <vx-card-fact label="Blocking" [value]="draft().blockPassengersWithOverduePayments ? 'Enabled' : 'Report only'" />
                  </div>
                </div>
                <div>
                  <p class="vx-section-label mb-2">Plan</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Plan" [value]="selectedPlan()?.name ?? 'Decide later'" />
                    @if (selectedPlan()) {
                      <vx-card-fact label="Billing" [value]="draft().billingCycle + ' · ' + draft().subscriptionStatus" />
                    }
                  </div>
                </div>
                <div>
                  <p class="vx-section-label mb-2">Tenant Admin</p>
                  @if (hasAdmin()) {
                    <div class="grid grid-cols-2 gap-4">
                      <vx-card-fact label="Name" [value]="adminName()" />
                      <vx-card-fact label="Invitation to" [value]="draft().adminEmail" />
                      <vx-card-fact label="Role" [value]="draft().adminRole" />
                      <vx-card-fact label="Tenant status on creation" [value]="draft().activateImmediately ? 'Active' : 'Pending'" />
                    </div>
                  } @else {
                    <p class="text-body text-ink-muted">No administrator yet — invite one from the tenant record later.</p>
                  }
                </div>
                @if (submitError(); as message) {
                  <p class="vx-error" data-testid="submit-error">{{ message }}</p>
                }
              </div>
            }
          }
        </vx-section-card>

        @if (stepError(); as message) {
          <p class="vx-error mt-3" data-testid="step-error">{{ message }}</p>
        }

        <div class="sticky bottom-0 mt-5 flex items-center justify-between gap-3 border-t border-line py-4" style="background: var(--vexto-bg)">
          <button type="button" class="vx-btn vx-btn-ghost" [disabled]="current() === 0 || saving()" (click)="back()">Back</button>
          <div class="flex items-center gap-2">
            <span class="text-meta text-ink-muted">Step {{ current() + 1 }} of {{ steps.length }}</span>
            @if (current() < steps.length - 1) {
              <button type="button" class="vx-btn vx-btn-primary" data-testid="wizard-continue" (click)="next()">Continue</button>
            } @else {
              <button type="button" class="vx-btn vx-btn-primary" data-testid="wizard-submit" [disabled]="saving()" (click)="submit()">
                {{ saving() ? 'Creating…' : 'Create Tenant' }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CmsTenantWizardPage {
  private readonly api = inject(PlatformApi);
  private readonly toast = inject(ToastService);
  protected readonly portal = inject(OperatorPortalLink);

  protected readonly steps = WIZARD_STEPS;
  protected readonly emirates = EMIRATES;

  protected readonly current = signal(0);
  protected readonly furthest = signal(0);
  protected readonly saving = signal(false);
  protected readonly resending = signal(false);
  protected readonly stepError = signal<string | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly created = signal<TenantOnboardingResult | null>(null);

  protected readonly catalogue = signal<TenantSettingsCatalogue | null>(null);
  protected readonly catalogueError = signal<string | null>(null);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly plansError = signal<string | null>(null);

  protected readonly draft = signal<TenantDraft>({
    name: '',
    legalName: '',
    tradeLicenseNumber: '',
    tradeLicenseExpiryDate: '',
    taxRegistrationNumber: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    emirate: '',
    country: 'United Arab Emirates',
    postalCode: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',

    // Replaced by the platform defaults as soon as the catalogue loads; blank rather than a
    // hardcoded region so a deployment elsewhere never sees the wrong answer flash first.
    timeZone: '',
    defaultCurrency: '',
    language: '',
    dateFormat: '',
    passengerPaymentGracePeriodDays: 0,
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
  });

  protected readonly hasAdmin = computed(() => this.draft().adminEmail.trim().length > 0);
  protected readonly adminName = computed(() => `${this.draft().adminFirstName} ${this.draft().adminLastName}`.trim());
  protected readonly selectedPlan = computed(() => this.plans().find((plan) => plan.code === this.draft().planCode) ?? null);

  protected readonly locationSummary = computed(() => {
    const draft = this.draft();

    return [draft.city, draft.emirate, draft.country].filter(Boolean).join(', ') || 'Not recorded';
  });

  constructor() {
    this.api.settingsCatalogue().subscribe({
      next: (catalogue) => {
        this.catalogue.set(catalogue);
        this.draft.update((current) => ({
          ...current,
          timeZone: catalogue.defaults.timeZone,
          defaultCurrency: catalogue.defaults.defaultCurrency,
          language: catalogue.defaults.language,
          dateFormat: catalogue.defaults.dateFormat,
          passengerPaymentGracePeriodDays: catalogue.defaults.passengerPaymentGracePeriodDays,
          blockPassengersWithOverduePayments: catalogue.defaults.blockPassengersWithOverduePayments,
        }));
      },
      error: () => this.catalogueError.set('We could not load the platform defaults. Type the settings by hand.'),
    });

    this.api.plans().subscribe({
      next: (plans) => this.plans.set(plans),
      error: () => this.plansError.set('We could not load the plan catalogue. You can assign a plan from the tenant record later.'),
    });
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

  protected cycle(event: Event): 'Monthly' | 'Yearly' {
    return this.text(event) === 'Yearly' ? 'Yearly' : 'Monthly';
  }

  protected subscriptionStatus(event: Event): 'Trial' | 'Active' {
    return this.text(event) === 'Active' ? 'Active' : 'Trial';
  }

  protected role(event: Event): 'TenantOwner' | 'TenantAdmin' {
    return this.text(event) === 'TenantAdmin' ? 'TenantAdmin' : 'TenantOwner';
  }

  protected price(plan: SubscriptionPlan): string {
    return formatMoney(plan.monthlyPrice, plan.currency);
  }

  protected extra(plan: SubscriptionPlan): string {
    return formatMoney(plan.extraPassengerPrice, plan.currency);
  }

  protected allowance(included: number): string {
    return included > 0 ? String(included) : 'Unlimited';
  }

  protected patch(change: Partial<TenantDraft>): void {
    this.draft.update((current) => ({ ...current, ...change }));
    this.stepError.set(null);
  }

  protected goTo(index: number): void {
    if (index <= this.furthest()) {
      this.current.set(index);
      this.stepError.set(null);
    }
  }

  protected back(): void {
    this.current.update((index) => Math.max(0, index - 1));
    this.stepError.set(null);
  }

  protected next(): void {
    const error = validateStep(this.steps[this.current()]!.id, this.draft());

    if (error) {
      this.stepError.set(error);

      return;
    }

    this.current.update((index) => Math.min(this.steps.length - 1, index + 1));
    this.furthest.update((furthest) => Math.max(furthest, this.current()));
    this.stepError.set(null);
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }

    const draft = this.draft();
    const blocking =
      validateStep('business', draft) ?? validateStep('contact', draft) ?? validateStep('settings', draft) ?? validateStep('admin', draft);

    if (blocking) {
      this.submitError.set(blocking);

      return;
    }

    this.saving.set(true);
    this.submitError.set(null);

    const clean = (value: string): string | null => value.trim() || null;

    this.api
      .onboard({
        tenant: {
          name: draft.name.trim(),
          legalName: draft.legalName.trim(),
          tradeLicenseNumber: draft.tradeLicenseNumber.trim(),
          tradeLicenseExpiryDate: draft.tradeLicenseExpiryDate || null,
          taxRegistrationNumber: clean(draft.taxRegistrationNumber),
          email: draft.email.trim(),
          phone: clean(draft.phone),
          website: clean(draft.website),
          businessDetails: {
            addressLine1: clean(draft.addressLine1),
            addressLine2: clean(draft.addressLine2),
            city: clean(draft.city),
            emirate: clean(draft.emirate),
            country: clean(draft.country),
            postalCode: clean(draft.postalCode),
            primaryContactName: clean(draft.primaryContactName),
            primaryContactEmail: clean(draft.primaryContactEmail),
            primaryContactPhone: clean(draft.primaryContactPhone),
          },
          settings: {
            timeZone: draft.timeZone.trim(),
            defaultCurrency: draft.defaultCurrency.trim(),
            language: draft.language.trim(),
            dateFormat: draft.dateFormat.trim(),
            passengerPaymentGracePeriodDays: draft.passengerPaymentGracePeriodDays,
            blockPassengersWithOverduePayments: draft.blockPassengersWithOverduePayments,
          },
          // Invited, never created active: the person learns about the account from the link.
          owner: this.hasAdmin()
            ? {
                email: draft.adminEmail.trim(),
                firstName: draft.adminFirstName.trim(),
                lastName: draft.adminLastName.trim(),
                phoneNumber: clean(draft.adminPhone),
                invite: true,
                role: draft.adminRole,
              }
            : null,
          activateImmediately: draft.activateImmediately,
        },
        plan: draft.planCode
          ? {
              planCode: draft.planCode,
              billingCycle: draft.billingCycle,
              price: null,
              status: draft.subscriptionStatus,
              startDate: null,
            }
          : null,
      })
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.created.set(result);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.submitError.set(
            error instanceof VextoApiError
              ? error.message
              : 'We could not create this tenant. Check the trade licence is not already registered.',
          );
        },
      });
  }

  protected deliveryLabel(result: TenantOnboardingResult): string {
    switch (result.tenant.ownerInvitationDelivery) {
      case 'Sent':
        return 'Sent';
      case 'Failed':
        return 'Delivery failed';
      default:
        return 'Not sent — no administrator';
    }
  }

  protected deliveryColour(result: TenantOnboardingResult): string {
    return result.tenant.ownerInvitationDelivery === 'Failed' ? 'var(--vexto-danger-text)' : 'var(--vexto-text)';
  }

  protected resend(result: TenantOnboardingResult): void {
    const userId = result.tenant.ownerUserId;

    if (!userId || this.resending()) {
      return;
    }

    this.resending.set(true);

    this.api.resendAdministratorInvitation(result.tenant.tenant.id, userId).subscribe({
      next: (resent) => {
        this.resending.set(false);
        this.created.set({
          ...result,
          tenant: { ...result.tenant, ownerInvitationDelivery: resent.delivery },
        });
        this.toast[resent.delivery === 'Sent' ? 'success' : 'error'](
          resent.delivery === 'Sent' ? 'Invitation sent.' : 'Invitation delivery failed again.',
        );
      },
      error: () => {
        this.resending.set(false);
        this.toast.error('We could not re-send the invitation.');
      },
    });
  }
}
