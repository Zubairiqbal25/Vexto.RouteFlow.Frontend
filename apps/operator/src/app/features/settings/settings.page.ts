import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SettingsApi } from '@vexto/api-client';
import { AuthService, AuthStore } from '@vexto/auth';
import type { TenantSettings, UpdateTenantSettingsCommand } from '@vexto/models';
import { PermissionService, VextoPermissions } from '@vexto/permissions';
import { ToastService, VxPageHeader, VxSectionCard, VxStatusBadge } from '@vexto/ui';

/**
 * The signed-in user's own account, and their operator's preferences.
 *
 * The tenant settings form is shown to anyone holding `Settings.View` and is only editable with
 * `Settings.Manage`. That split is not cosmetic: a dispatcher needs to read the time zone, because
 * it is what every departure time on their screen means, and must not be able to change it,
 * because doing so moves every trip in the system.
 *
 * The three lists of allowed values are deliberately closed. They mirror the deployment policy the
 * backend validates against; a value this form does not offer would be rejected anyway, so
 * offering it would only produce an error the user cannot act on.
 */
@Component({
  selector: 'vexto-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VxPageHeader, VxSectionCard, VxStatusBadge],
  template: `
    <vx-page-header title="Settings" description="Your account and access." />

    <div class="grid gap-5 lg:grid-cols-2">
      @if (can(perms.Settings.View)) {
        <vx-section-card
          class="lg:col-span-2 block"
          title="Operator settings"
          description="How dates, times and money are read across this operator."
        >
          @if (loadingSettings()) {
            <p class="text-body text-ink-muted">Loading settings…</p>
          } @else if (!settings()) {
            <p class="text-body text-ink-muted">We could not load your operator settings.</p>
          } @else {
            <form class="grid gap-x-8 gap-y-5 sm:grid-cols-2" (submit)="save($event)">
              <label class="block">
                <span class="vx-section-label">Time zone</span>
                <select
                  class="vx-select mt-1 w-full"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [value]="draft().timeZone"
                  (change)="patch({ timeZone: value($event) })"
                >
                  @for (zone of timeZones; track zone) {
                    <option [value]="zone">{{ zone }}</option>
                  }
                </select>
              </label>

              <label class="block">
                <span class="vx-section-label">Default currency</span>
                <select
                  class="vx-select mt-1 w-full"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [value]="draft().defaultCurrency"
                  (change)="patch({ defaultCurrency: value($event) })"
                >
                  @for (currency of currencies; track currency) {
                    <option [value]="currency">{{ currency }}</option>
                  }
                </select>
              </label>

              <label class="block">
                <span class="vx-section-label">Date format</span>
                <select
                  class="vx-select mt-1 w-full"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [value]="draft().dateFormat"
                  (change)="patch({ dateFormat: value($event) })"
                >
                  @for (format of dateFormats; track format) {
                    <option [value]="format">{{ format }}</option>
                  }
                </select>
              </label>

              <label class="block">
                <span class="vx-section-label">Language</span>
                <select
                  class="vx-select mt-1 w-full"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [value]="draft().language"
                  (change)="patch({ language: value($event) })"
                >
                  @for (language of languages; track language.code) {
                    <option [value]="language.code">{{ language.name }}</option>
                  }
                </select>
              </label>

              <div class="sm:col-span-2 border-t border-line-subtle pt-5">
                <h3 class="vx-section-label">Passenger payments</h3>
                <p class="mt-1 text-meta text-ink-muted">
                  How long a passenger may keep travelling after an invoice falls due, and whether
                  running out of grace actually stops them boarding.
                </p>
              </div>

              <label class="block">
                <span class="vx-section-label">Grace period (days)</span>
                <input
                  type="number"
                  min="0"
                  max="90"
                  class="vx-input mt-1 w-full"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [value]="draft().passengerPaymentGracePeriodDays"
                  (change)="patch({ passengerPaymentGracePeriodDays: number($event) })"
                />
                <span class="mt-1 block text-meta text-ink-muted">
                  0 means access stops the day after the due date.
                </span>
              </label>

              <label class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="vx-checkbox mt-1"
                  [disabled]="!can(perms.Settings.Manage) || saving()"
                  [checked]="draft().blockPassengersWithOverduePayments"
                  (change)="patch({ blockPassengersWithOverduePayments: checked($event) })"
                />
                <span>
                  <span class="vx-section-label">Block travel when grace runs out</span>
                  <span class="mt-1 block text-meta text-ink-muted">
                    Off means an overdue passenger is flagged to you and to the driver, and is still
                    carried. On means the driver's manifest shows them as blocked. Either way they
                    can still sign in to see and pay what they owe.
                  </span>
                </span>
              </label>

              @if (can(perms.Settings.Manage)) {
                <div class="sm:col-span-2 flex flex-wrap gap-2 border-t border-line-subtle pt-5">
                  <button type="submit"
          (click)="save($event)" class="vx-btn vx-btn-primary" [disabled]="saving()">
                    {{ saving() ? 'Saving…' : 'Save settings' }}
                  </button>
                  <button
                    type="button"
                    class="vx-btn vx-btn-ghost"
                    [disabled]="saving()"
                    (click)="reset()"
                  >
                    Discard changes
                  </button>
                </div>
              } @else {
                <p class="sm:col-span-2 border-t border-line-subtle pt-5 text-meta text-ink-muted">
                  Changing these needs the Settings.Manage permission. Ask an administrator.
                </p>
              }
            </form>
          }
        </vx-section-card>
      }

      <vx-section-card title="Your account">
        <dl class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <dt class="vx-section-label">Name</dt>
            <dd class="mt-1 text-body text-ink">{{ fullName() }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Email</dt>
            <dd class="mt-1 truncate text-body text-ink">{{ user()?.email }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Operator</dt>
            <dd class="mt-1 text-body text-ink">{{ user()?.tenantName ?? 'Platform' }}</dd>
          </div>
          <div>
            <dt class="vx-section-label">Roles</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              @for (role of user()?.roles ?? []; track role) {
                <vx-status-badge tone="neutral" [label]="role" />
              }
            </dd>
          </div>
        </dl>

        <div class="mt-6 flex flex-wrap gap-2 border-t border-line-subtle pt-5">
          <button type="button" class="vx-btn vx-btn-secondary" (click)="refresh()">
            Refresh permissions
          </button>
          <button type="button" class="vx-btn vx-btn-ghost" (click)="signOut()">Sign out</button>
        </div>
      </vx-section-card>

      <vx-section-card
        title="Permissions"
        description="What this account can do. Granted by your roles."
      >
        @if (permissions().length === 0) {
          <p class="text-body text-ink-muted">No permissions granted.</p>
        } @else {
          <div class="flex flex-wrap gap-1.5">
            @for (permission of permissions(); track permission) {
              <vx-status-badge tone="primary" [label]="permission" />
            }
          </div>
        }
      </vx-section-card>
    </div>
  `,
})
export class SettingsPage {
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly permissionService = inject(PermissionService);
  private readonly settingsApi = inject(SettingsApi);

  protected readonly perms = VextoPermissions;
  protected readonly user = this.store.user;

  /** Mirrors the deployment policy the backend validates against. */
  protected readonly timeZones = [
    'Asia/Dubai',
    'Asia/Riyadh',
    'Asia/Qatar',
    'Asia/Kuwait',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Europe/London',
    'UTC',
  ];

  protected readonly currencies = ['AED', 'SAR', 'USD', 'EUR', 'GBP', 'INR'];
  protected readonly dateFormats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy'];

  protected readonly languages = [
    { code: 'en', name: 'English' },
    { code: 'ar', name: 'العربية' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'ur', name: 'اردو' },
  ];

  protected readonly settings = signal<TenantSettings | null>(null);
  protected readonly loadingSettings = signal(true);
  protected readonly saving = signal(false);

  /** The unsaved form. Kept apart from `settings` so discarding is a copy, not a refetch. */
  protected readonly draft = signal<UpdateTenantSettingsCommand>({
    timeZone: 'Asia/Dubai',
    defaultCurrency: 'AED',
    dateFormat: 'dd/MM/yyyy',
    language: 'en',
    passengerPaymentGracePeriodDays: 0,
    blockPassengersWithOverduePayments: false,
  });

  constructor() {
    if (this.permissionService.has(VextoPermissions.Settings.View)) {
      this.load();
    } else {
      this.loadingSettings.set(false);
    }
  }

  protected can(permission: string): boolean {
    return this.permissionService.has(permission);
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /** Clamped to the range the API accepts, so a typed "999" is corrected rather than rejected. */
  protected number(event: Event): number {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

    return Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 90);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected patch(change: Partial<UpdateTenantSettingsCommand>): void {
    this.draft.update((current) => ({ ...current, ...change }));
  }

  protected reset(): void {
    const settings = this.settings();

    if (settings) {
      this.draft.set(this.toDraft(settings));
    }
  }

  protected save(event: Event): void {
    event.preventDefault();

    if (this.saving()) {
      return;
    }

    this.saving.set(true);

    this.settingsApi.update(this.draft()).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.draft.set(this.toDraft(settings));
        this.saving.set(false);
        this.toast.success('Operator settings saved.');
      },
      error: () => {
        this.saving.set(false);

        // The message stays general: the backend returns per-field validation errors, and the
        // form only offers values it already knows are accepted, so a failure here is unexpected.
        this.toast.error('We could not save your settings.');
      },
    });
  }

  private load(): void {
    this.settingsApi.get().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.draft.set(this.toDraft(settings));
        this.loadingSettings.set(false);
      },
      error: () => this.loadingSettings.set(false),
    });
  }

  private toDraft(settings: TenantSettings): UpdateTenantSettingsCommand {
    return {
      timeZone: settings.timeZone,
      defaultCurrency: settings.defaultCurrency,
      dateFormat: settings.dateFormat,
      language: settings.language,
      passengerPaymentGracePeriodDays: settings.passengerPaymentGracePeriodDays,
      blockPassengersWithOverduePayments: settings.blockPassengersWithOverduePayments,
    };
  }

  protected readonly fullName = computed(() => {
    const user = this.user();

    return user ? `${user.firstName} ${user.lastName}` : '—';
  });

  protected readonly permissions = computed(() =>
    [...this.permissionService.granted()].sort((a, b) => a.localeCompare(b)),
  );

  /** Picks up a role change without making the user sign out and back in. */
  protected refresh(): void {
    this.auth.refreshProfile().subscribe({
      next: () => this.toast.success('Permissions refreshed.'),
      error: () => this.toast.error('We could not refresh your permissions.'),
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
