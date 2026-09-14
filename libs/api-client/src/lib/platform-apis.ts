import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  AssignTenantPlanCommand,
  AssignedPlan,
  CreateTenantCommand,
  CreateTenantResult,
  InviteTenantAdministratorCommand,
  OperatorPassengerAccess,
  PagedResult,
  SubscriptionPlan,
  TenantAdministrator,
  TenantAdministratorInvitation,
  TenantDetailResponse,
  TenantOnboardingCommand,
  TenantOnboardingResult,
  TenantPickerOption,
  TenantResponse,
  TenantSettings,
  TenantSettingsCatalogue,
  TenantSubscription,
  TenantSummary,
  UpdateTenantCommand,
  UpdateTenantSettingsCommand,
} from '@vexto/models';
import { VextoHttp } from './vexto-http';

/**
 * The platform surface: Vexto's own staff administering transport operators.
 *
 * Every route here is cross-tenant by design and is gated on `Tenants.View` / `Tenants.Manage`,
 * which no tenant role holds. It is deliberately a separate service from the operator APIs so that
 * "this call reaches every tenant" is visible at the import, not buried in a URL.
 *
 * The CMS is its main consumer (docs/tenant-onboarding.md). Nothing operational — routes, trips,
 * passengers — is reachable through it, and nothing should be added that is.
 */
@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(VextoHttp);

  list(query: {
    search?: string | null;
    status?: string | null;
    emirate?: string | null;
    pageNumber?: number;
    pageSize?: number;
  }): Observable<PagedResult<TenantResponse>> {
    return this.http.get('/api/v1/platform/tenants', query);
  }

  /**
   * Searches operators for the tenant selector. Bounded and thin — id, name, status and location —
   * so the dropdown never becomes a way to read the tenant list in full.
   */
  picker(search?: string | null, pageSize = 20): Observable<TenantPickerOption[]> {
    return this.http.get('/api/v1/platform/tenants/picker', { search, pageSize });
  }

  /** Counts by status, pending invitations and recent onboarding — the CMS dashboard's numbers. */
  summary(): Observable<TenantSummary> {
    return this.http.get('/api/v1/platform/tenants/summary');
  }

  /** The platform defaults a new operator starts with, and what the settings screen may offer. */
  settingsCatalogue(): Observable<TenantSettingsCatalogue> {
    return this.http.get('/api/v1/platform/tenants/settings-catalogue');
  }

  get(tenantId: string): Observable<TenantDetailResponse> {
    return this.http.get(`/api/v1/platform/tenants/${tenantId}`);
  }

  create(command: CreateTenantCommand): Observable<CreateTenantResult> {
    return this.http.post('/api/v1/platform/tenants', command);
  }

  /**
   * The CMS wizard's submission: tenant, settings, plan and first administrator, committed as one.
   * The invitation email goes after the commit; `tenant.ownerInvitationDelivery` says whether it went.
   */
  onboard(command: TenantOnboardingCommand): Observable<TenantOnboardingResult> {
    return this.http.post('/api/v1/platform/tenants/onboarding', command);
  }

  update(tenantId: string, command: UpdateTenantCommand): Observable<TenantResponse> {
    return this.http.put(`/api/v1/platform/tenants/${tenantId}`, command);
  }

  updateSettings(tenantId: string, command: UpdateTenantSettingsCommand): Observable<TenantSettings> {
    return this.http.put(`/api/v1/platform/tenants/${tenantId}/settings`, command);
  }

  activate(tenantId: string): Observable<TenantResponse> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/activate`);
  }

  suspend(tenantId: string): Observable<TenantResponse> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/suspend`);
  }

  /* Logo ------------------------------------------------------------------------------------- */

  /** The path the avatar fetches the logo from; authorized, so never a plain `<img src>`. */
  logoPath(tenantId: string): string {
    return `/api/v1/platform/tenants/${tenantId}/logo`;
  }

  uploadLogo(tenantId: string, file: File): Observable<TenantResponse> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http.upload(this.logoPath(tenantId), form);
  }

  removeLogo(tenantId: string): Observable<TenantResponse> {
    return this.http.delete(this.logoPath(tenantId));
  }

  /* Plans ------------------------------------------------------------------------------------ */

  plans(): Observable<SubscriptionPlan[]> {
    return this.http.get('/api/v1/platform/subscription-plans');
  }

  subscription(tenantId: string): Observable<TenantSubscription> {
    return this.http.get(`/api/v1/platform/tenants/${tenantId}/subscription`);
  }

  assignPlan(tenantId: string, command: AssignTenantPlanCommand): Observable<AssignedPlan> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/subscription`, command);
  }

  /* Administrators --------------------------------------------------------------------------- */

  administrators(tenantId: string): Observable<TenantAdministrator[]> {
    return this.http.get(`/api/v1/platform/tenants/${tenantId}/administrators`);
  }

  inviteAdministrator(
    tenantId: string,
    command: InviteTenantAdministratorCommand,
  ): Observable<TenantAdministratorInvitation> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/administrators/invite`, command);
  }

  resendAdministratorInvitation(
    tenantId: string,
    userId: string,
  ): Observable<TenantAdministratorInvitation> {
    return this.http.post(
      `/api/v1/platform/tenants/${tenantId}/administrators/${userId}/resend-invitation`,
    );
  }

  revokeAdministratorInvitation(tenantId: string, userId: string): Observable<TenantAdministrator> {
    return this.http.post(
      `/api/v1/platform/tenants/${tenantId}/administrators/${userId}/revoke-invitation`,
    );
  }

  suspendAdministrator(tenantId: string, userId: string): Observable<TenantAdministrator> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/administrators/${userId}/suspend`);
  }

  activateAdministrator(tenantId: string, userId: string): Observable<TenantAdministrator> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/administrators/${userId}/activate`);
  }
}

/**
 * Transport access for the operator's own passenger screens.
 *
 * Separate from `PassengersApi` because the answer comes from Billing rather than from the
 * passenger record, and because it is gated on `Billing.View` — a dispatcher can see a passenger
 * and cannot see what they owe.
 */
@Injectable({ providedIn: 'root' })
export class PassengerAccessApi {
  private readonly http = inject(VextoHttp);

  get(passengerId: string): Observable<OperatorPassengerAccess> {
    return this.http.get(`/api/v1/passengers/${passengerId}/access-status`);
  }

  /**
   * One request for a page of passengers.
   *
   * A POST for a read, because the input is a list of ids: forty of them in a query string is a URL
   * length nobody should have to reason about. Asking per row would be the N+1 the batch exists to
   * avoid.
   */
  forMany(passengerIds: readonly string[]): Observable<OperatorPassengerAccess[]> {
    return this.http.post('/api/v1/passengers/access-statuses', { passengerIds });
  }
}
