import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlatformApi, VextoApiError } from '@vexto/api-client';
import { TenantContextService } from '@vexto/auth';
import type { CreateTenantResult } from '@vexto/models';
import { ToastService, VxCardFact, VxIcon, VxSectionCard } from '@vexto/ui';

/** The wizard's own model. Flat and plain; it becomes the API command only at the end. */
interface TenantDraft {
  name: string;
  legalName: string;
  tradeLicenseNumber: string;
  tradeLicenseExpiryDate: string;
  taxRegistrationNumber: string;
  email: string;
  phone: string;
  website: string;

  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;

  addressLine1: string;
  addressLine2: string;
  city: string;
  emirate: string;
  country: string;
  postalCode: string;

  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;

  passengerPaymentGracePeriodDays: number;
  blockPassengersWithOverduePayments: boolean;

  activateImmediately: boolean;
}

interface StepDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

const STEPS: readonly StepDefinition[] = [
  { id: 'business', title: 'Business', description: 'Who the operator is, on paper.' },
  { id: 'contact', title: 'Contact', description: 'Who Vexto talks to.' },
  { id: 'address', title: 'Address', description: 'Where they operate from.' },
  { id: 'owner', title: 'Owner', description: 'Who runs the account.' },
  { id: 'settings', title: 'Settings', description: 'How passenger billing behaves.' },
  { id: 'review', title: 'Review', description: 'Check before creating.' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Onboarding a transport operator, as a wizard rather than one long form.
 *
 * **Why steps.** The record has twenty-odd fields across five unrelated concerns — a trade licence,
 * a postal address, a person to invite, a billing policy. One page of that is a wall nobody reads,
 * and the validation failures land in three places at once. Six short steps each ask one question,
 * and the Review step is where it becomes a decision rather than a form submission.
 *
 * **Only the first step is required.** Trading name, legal name, trade licence and a business email
 * are what the API insists on, because that is what an operator is; everything after can be filled
 * in over the following days and the wizard says so rather than blocking. That mirrors the backend,
 * where every part of `businessDetails` is optional for exactly this reason.
 *
 * **The owner is invited, never given a password.** Omitting `owner.password` is what makes the API
 * issue an invitation, and this screen never offers the alternative — a platform administrator
 * inventing a credential for a customer and then telling them what it is makes Vexto's staff
 * briefly the holder of it.
 */
@Component({
  selector: 'vexto-tenant-wizard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VxCardFact, VxIcon, VxSectionCard],
  template: `
    @if (created(); as result) {
      <!-- Success is its own screen, not a toast. Onboarding ends with three plausible next
           actions, and a banner that fades after four seconds answers none of them. -->
      <div class="mx-auto max-w-xl py-10 text-center">
        <span
          class="mx-auto mb-5 flex size-14 items-center justify-center rounded-full"
          style="background: var(--vexto-success-soft); color: var(--vexto-success-text)"
        >
          <vx-icon name="check-circle" [size]="28" />
        </span>

        <h1 class="text-xl font-semibold tracking-tight text-ink">
          {{ result.tenant.name }} is on the platform
        </h1>
        <p class="mt-2 text-body text-ink-muted">
          {{
            result.ownerInvitationExpiresAtUtc
              ? 'An invitation has been sent to ' + draft().ownerEmail + '.'
              : 'Invite an owner from the tenant record when you are ready.'
          }}
        </p>

        <div class="mt-8 flex flex-col gap-2">
          <button type="button" class="vx-btn vx-btn-primary" (click)="enterTenant(result)">
            Open {{ result.tenant.name }}
          </button>
          <button type="button" class="vx-btn vx-btn-secondary" (click)="startAnother()">
            Onboard another operator
          </button>
          <a class="vx-btn vx-btn-ghost" routerLink="/platform">Back to the platform overview</a>
        </div>
      </div>
    } @else {
      <div class="mx-auto max-w-3xl">
        <header class="mb-6">
          <a
            routerLink="/platform/tenants"
            class="mb-3 inline-flex items-center gap-1.5 text-body text-ink-muted hover:text-ink"
          >
            <vx-icon name="arrow-left" [size]="16" />
            Tenants
          </a>
          <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Onboard a transport operator
          </h1>
        </header>

        <!-- The step rail. A real ordered list so a screen reader announces "step 2 of 6", and each
             completed step is a button back to itself — the commonest thing anybody wants here is
             to fix the thing they typed two steps ago. -->
        <ol class="mb-6 flex flex-wrap gap-x-2 gap-y-3" aria-label="Onboarding steps">
          @for (step of steps; track step.id; let index = $index) {
            <li class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-2 rounded-full px-3 py-1.5 text-meta font-medium
                       transition-colors"
                [style.background]="
                  index === current()
                    ? 'var(--vexto-primary-soft)'
                    : index < current() ? 'var(--vexto-surface-muted)' : 'transparent'
                "
                [style.color]="
                  index === current()
                    ? 'var(--vexto-primary-active)'
                    : index < current() ? 'var(--vexto-text-secondary)' : 'var(--vexto-text-muted)'
                "
                [disabled]="index > furthest()"
                [attr.aria-current]="index === current() ? 'step' : null"
                (click)="goTo(index)"
              >
                <span
                  class="flex size-5 flex-none items-center justify-center rounded-full text-[0.625rem]"
                  [style.background]="
                    index < current() ? 'var(--vexto-success)' : 'var(--vexto-border-strong)'
                  "
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
                  <input
                    class="vx-input"
                    [value]="draft().name"
                    (input)="patch({ name: text($event) })"
                  />
                  <span class="vx-help">What passengers and your team will see. e.g. Al Noor Transport</span>
                </label>

                <label class="vx-field">
                  <span class="vx-label vx-required">Legal name</span>
                  <input
                    class="vx-input"
                    [value]="draft().legalName"
                    (input)="patch({ legalName: text($event) })"
                  />
                  <span class="vx-help">Exactly as it appears on the trade licence.</span>
                </label>

                <label class="vx-field">
                  <span class="vx-label vx-required">Trade licence number</span>
                  <input
                    class="vx-input"
                    [value]="draft().tradeLicenseNumber"
                    (input)="patch({ tradeLicenseNumber: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Licence expiry</span>
                  <input
                    type="date"
                    class="vx-input"
                    [value]="draft().tradeLicenseExpiryDate"
                    (input)="patch({ tradeLicenseExpiryDate: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label vx-required">Business email</span>
                  <input
                    type="email"
                    class="vx-input"
                    [value]="draft().email"
                    (input)="patch({ email: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Business phone</span>
                  <input
                    class="vx-input"
                    [value]="draft().phone"
                    (input)="patch({ phone: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Tax registration number</span>
                  <input
                    class="vx-input"
                    [value]="draft().taxRegistrationNumber"
                    (input)="patch({ taxRegistrationNumber: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Website</span>
                  <input
                    class="vx-input"
                    placeholder="https://"
                    [value]="draft().website"
                    (input)="patch({ website: text($event) })"
                  />
                </label>
              </div>
            }

            @case ('contact') {
              <p class="mb-4 text-body text-ink-secondary">
                The person Vexto telephones about this account — often a company secretary or an
                owner who never signs in. This is not a login.
              </p>

              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label">Name</span>
                  <input
                    class="vx-input"
                    [value]="draft().primaryContactName"
                    (input)="patch({ primaryContactName: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Email</span>
                  <input
                    type="email"
                    class="vx-input"
                    [value]="draft().primaryContactEmail"
                    (input)="patch({ primaryContactEmail: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Phone</span>
                  <input
                    class="vx-input"
                    [value]="draft().primaryContactPhone"
                    (input)="patch({ primaryContactPhone: text($event) })"
                  />
                </label>
              </div>
            }

            @case ('address') {
              <div class="vx-form-grid">
                <label class="vx-field vx-span-2">
                  <span class="vx-label">Address</span>
                  <input
                    class="vx-input"
                    [value]="draft().addressLine1"
                    (input)="patch({ addressLine1: text($event) })"
                  />
                </label>

                <label class="vx-field vx-span-2">
                  <span class="vx-label">Address line 2</span>
                  <input
                    class="vx-input"
                    [value]="draft().addressLine2"
                    (input)="patch({ addressLine2: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">City</span>
                  <input
                    class="vx-input"
                    [value]="draft().city"
                    (input)="patch({ city: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Emirate / state / province</span>
                  <input
                    class="vx-input"
                    [value]="draft().emirate"
                    (input)="patch({ emirate: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Country</span>
                  <input
                    class="vx-input"
                    [value]="draft().country"
                    (input)="patch({ country: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Postal code</span>
                  <input
                    class="vx-input"
                    [value]="draft().postalCode"
                    (input)="patch({ postalCode: text($event) })"
                  />
                </label>
              </div>
            }

            @case ('owner') {
              <p class="mb-4 text-body text-ink-secondary">
                They receive an invitation and choose their own password. You never see it.
              </p>

              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label">First name</span>
                  <input
                    class="vx-input"
                    [value]="draft().ownerFirstName"
                    (input)="patch({ ownerFirstName: text($event) })"
                  />
                </label>

                <label class="vx-field">
                  <span class="vx-label">Last name</span>
                  <input
                    class="vx-input"
                    [value]="draft().ownerLastName"
                    (input)="patch({ ownerLastName: text($event) })"
                  />
                </label>

                <label class="vx-field vx-span-2">
                  <span class="vx-label">Email</span>
                  <input
                    type="email"
                    class="vx-input"
                    [value]="draft().ownerEmail"
                    (input)="patch({ ownerEmail: text($event) })"
                  />
                  <span class="vx-help">
                    Leave the whole step blank to create the operator without an owner. You can
                    invite one later from the tenant record.
                  </span>
                </label>
              </div>

              @if (ownerError(); as message) {
                <p class="vx-error mt-3">{{ message }}</p>
              }
            }

            @case ('settings') {
              <div class="vx-form-grid">
                <label class="vx-field">
                  <span class="vx-label">Payment grace period (days)</span>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    class="vx-input"
                    [value]="draft().passengerPaymentGracePeriodDays"
                    (input)="patch({ passengerPaymentGracePeriodDays: number($event) })"
                  />
                  <span class="vx-help">
                    How long a passenger keeps travelling after an invoice falls due. 0 means access
                    stops the day after.
                  </span>
                </label>

                <label class="vx-field">
                  <span class="vx-label">Blocking</span>
                  <span class="flex items-start gap-2.5 pt-2">
                    <input
                      type="checkbox"
                      class="vx-checkbox mt-0.5"
                      [checked]="draft().blockPassengersWithOverduePayments"
                      (change)="patch({ blockPassengersWithOverduePayments: checked($event) })"
                    />
                    <span class="text-body text-ink-secondary">
                      Stop overdue passengers travelling once grace runs out
                    </span>
                  </span>
                  <span class="vx-help">
                    Off means they are flagged to the operator and the driver, and still carried.
                    Either way they can sign in to pay.
                  </span>
                </label>

                <label class="vx-field vx-span-2">
                  <span class="vx-label">Activation</span>
                  <span class="flex items-start gap-2.5 pt-2">
                    <input
                      type="checkbox"
                      class="vx-checkbox mt-0.5"
                      [checked]="draft().activateImmediately"
                      (change)="patch({ activateImmediately: checked($event) })"
                    />
                    <span class="text-body text-ink-secondary">
                      Activate straight away — their users can sign in as soon as they accept
                    </span>
                  </span>
                  <span class="vx-help">
                    Leave off to create the operator as Pending and activate once you have checked
                    the trade licence.
                  </span>
                </label>
              </div>
            }

            @case ('review') {
              <div class="flex flex-col gap-5">
                <div>
                  <p class="vx-section-label mb-2">Business</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Trading name" [value]="draft().name" />
                    <vx-card-fact label="Legal name" [value]="draft().legalName" />
                    <vx-card-fact label="Trade licence" [value]="draft().tradeLicenseNumber" />
                    <vx-card-fact label="Business email" [value]="draft().email" />
                  </div>
                </div>

                <div>
                  <p class="vx-section-label mb-2">Contact and address</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact label="Primary contact" [value]="draft().primaryContactName" />
                    <vx-card-fact label="Location" [value]="locationSummary()" />
                  </div>
                </div>

                <div>
                  <p class="vx-section-label mb-2">Owner</p>
                  @if (hasOwner()) {
                    <div class="grid grid-cols-2 gap-4">
                      <vx-card-fact label="Name" [value]="ownerName()" />
                      <vx-card-fact label="Invitation to" [value]="draft().ownerEmail" />
                    </div>
                  } @else {
                    <p class="text-body text-ink-muted">
                      No owner — you can invite one from the tenant record later.
                    </p>
                  }
                </div>

                <div>
                  <p class="vx-section-label mb-2">Settings</p>
                  <div class="grid grid-cols-2 gap-4">
                    <vx-card-fact
                      label="Grace period"
                      [value]="draft().passengerPaymentGracePeriodDays + ' days'"
                    />
                    <vx-card-fact
                      label="Blocking"
                      [value]="draft().blockPassengersWithOverduePayments ? 'Enabled' : 'Report only'"
                    />
                    <vx-card-fact
                      label="Status on creation"
                      [value]="draft().activateImmediately ? 'Active' : 'Pending'"
                    />
                  </div>
                </div>

                @if (submitError(); as message) {
                  <p class="vx-error">{{ message }}</p>
                }
              </div>
            }
          }
        </vx-section-card>

        @if (stepError(); as message) {
          <p class="vx-error mt-3">{{ message }}</p>
        }

        <!-- A sticky footer, because the form is taller than the viewport on the first step and the
             way forward should never require scrolling to find. -->
        <div
          class="sticky bottom-0 mt-5 flex items-center justify-between gap-3 border-t border-line
                 py-4"
          style="background: var(--vexto-bg)"
        >
          <button
            type="button"
            class="vx-btn vx-btn-ghost"
            [disabled]="current() === 0 || saving()"
            (click)="back()"
          >
            Back
          </button>

          <div class="flex items-center gap-2">
            <span class="text-meta text-ink-muted">
              Step {{ current() + 1 }} of {{ steps.length }}
            </span>

            @if (current() < steps.length - 1) {
              <button type="button" class="vx-btn vx-btn-primary" (click)="next()">Continue</button>
            } @else {
              <button
                type="button"
                class="vx-btn vx-btn-primary"
                [disabled]="saving()"
                (click)="submit()"
              >
                {{ saving() ? 'Creating…' : 'Create tenant' }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class TenantWizardPage {
  private readonly api = inject(PlatformApi);
  private readonly context = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly steps = STEPS;

  protected readonly current = signal(0);

  /** How far they have reached, so the rail can offer a jump back but never a jump ahead. */
  protected readonly furthest = signal(0);

  protected readonly saving = signal(false);
  protected readonly stepError = signal<string | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly created = signal<CreateTenantResult | null>(null);

  protected readonly draft = signal<TenantDraft>({
    name: '',
    legalName: '',
    tradeLicenseNumber: '',
    tradeLicenseExpiryDate: '',
    taxRegistrationNumber: '',
    email: '',
    phone: '',
    website: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    emirate: '',

    // A sensible starting point for the pilot market, and editable — not a hardcoded assumption.
    // The field is plain text precisely so a deployment outside the UAE is a typing change.
    country: 'United Arab Emirates',
    postalCode: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerEmail: '',

    // Mirrors the platform defaults the backend applies: a week of grace, and blocking off until
    // the operator decides otherwise.
    passengerPaymentGracePeriodDays: 7,
    blockPassengersWithOverduePayments: false,
    activateImmediately: false,
  });

  protected readonly hasOwner = computed(() => this.draft().ownerEmail.trim().length > 0);

  protected readonly ownerName = computed(() =>
    `${this.draft().ownerFirstName} ${this.draft().ownerLastName}`.trim(),
  );

  protected readonly locationSummary = computed(() => {
    const draft = this.draft();

    return [draft.city, draft.emirate, draft.country].filter(Boolean).join(', ') || 'Not recorded';
  });

  /** An owner is all-or-nothing: a name with no address cannot be invited. */
  protected readonly ownerError = computed(() => {
    const draft = this.draft();
    const email = draft.ownerEmail.trim();
    const named = `${draft.ownerFirstName}${draft.ownerLastName}`.trim().length > 0;

    if (!email) {
      return named ? 'Add an email address so the owner can be invited.' : null;
    }

    if (!EMAIL.test(email)) {
      return 'That does not look like an email address.';
    }

    return named ? null : 'Add the owner’s name.';
  });

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected number(event: Event): number {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

    return Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 90);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
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
    const error = this.validate(this.steps[this.current()]!.id);

    if (error) {
      this.stepError.set(error);

      return;
    }

    this.current.update((index) => Math.min(this.steps.length - 1, index + 1));
    this.furthest.update((furthest) => Math.max(furthest, this.current()));
    this.stepError.set(null);
  }

  /**
   * Only the first step and the owner block are checked here.
   *
   * The rest is optional on the server too, and a wizard that demands a postal code before it will
   * let you continue is a wizard that gets abandoned on step three.
   */
  private validate(stepId: string): string | null {
    const draft = this.draft();

    if (stepId === 'business') {
      if (!draft.name.trim()) {
        return 'A trading name is required.';
      }

      if (!draft.legalName.trim()) {
        return 'The legal name on the trade licence is required.';
      }

      if (!draft.tradeLicenseNumber.trim()) {
        return 'A trade licence number is required.';
      }

      if (!EMAIL.test(draft.email.trim())) {
        return 'A valid business email is required.';
      }
    }

    if (stepId === 'owner') {
      return this.ownerError();
    }

    return null;
  }

  protected submit(): void {
    const draft = this.draft();
    const blocking = this.validate('business') ?? this.ownerError();

    if (blocking) {
      this.submitError.set(blocking);

      return;
    }

    this.saving.set(true);
    this.submitError.set(null);

    this.api
      .create({
        name: draft.name.trim(),
        legalName: draft.legalName.trim(),
        tradeLicenseNumber: draft.tradeLicenseNumber.trim(),
        tradeLicenseExpiryDate: draft.tradeLicenseExpiryDate || null,
        taxRegistrationNumber: draft.taxRegistrationNumber.trim() || null,
        email: draft.email.trim(),
        phone: draft.phone.trim() || null,
        website: draft.website.trim() || null,
        businessDetails: {
          addressLine1: draft.addressLine1.trim() || null,
          addressLine2: draft.addressLine2.trim() || null,
          city: draft.city.trim() || null,
          emirate: draft.emirate.trim() || null,
          country: draft.country.trim() || null,
          postalCode: draft.postalCode.trim() || null,
          primaryContactName: draft.primaryContactName.trim() || null,
          primaryContactEmail: draft.primaryContactEmail.trim() || null,
          primaryContactPhone: draft.primaryContactPhone.trim() || null,
        },

        // No password, ever. Omitting it is what makes the API issue an invitation instead.
        owner: this.hasOwner()
          ? {
              email: draft.ownerEmail.trim(),
              firstName: draft.ownerFirstName.trim(),
              lastName: draft.ownerLastName.trim(),
              phoneNumber: null,
              password: null,
            }
          : null,
        activateImmediately: draft.activateImmediately,
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
              : 'We could not create this operator. Check the trade licence is not already registered.',
          );
        },
      });
  }

  /** Enters the new operator's context, which is almost always what happens next. */
  protected enterTenant(result: CreateTenantResult): void {
    this.context.enter({ id: result.tenant.id, name: result.tenant.name, status: result.tenant.status });
    this.toast.success(`You are now working in ${result.tenant.name}.`);

    void this.router.navigateByUrl('/dashboard');
  }

  protected startAnother(): void {
    this.created.set(null);
    this.current.set(0);
    this.furthest.set(0);
    this.draft.update((current) => ({
      ...current,
      name: '',
      legalName: '',
      tradeLicenseNumber: '',
      tradeLicenseExpiryDate: '',
      taxRegistrationNumber: '',
      email: '',
      phone: '',
      website: '',
      primaryContactName: '',
      primaryContactEmail: '',
      primaryContactPhone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      ownerFirstName: '',
      ownerLastName: '',
      ownerEmail: '',
    }));
  }
}
