import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CreateTenantCommand,
  CreateTenantResult,
  OperatorPassengerAccess,
  PagedResult,
  TenantDetailResponse,
  TenantPickerOption,
  TenantResponse,
  UpdateTenantCommand,
} from '@vexto/models';
import { VextoHttp } from './vexto-http';

/**
 * The platform surface: Vexto's own staff administering transport operators.
 *
 * Every route here is cross-tenant by design and is gated on `Tenants.View` / `Tenants.Manage`,
 * which no tenant role holds. It is deliberately a separate service from the operator APIs so that
 * "this call reaches every tenant" is visible at the import, not buried in a URL.
 */
@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(VextoHttp);

  list(query: {
    search?: string | null;
    status?: string | null;
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

  get(tenantId: string): Observable<TenantDetailResponse> {
    return this.http.get(`/api/v1/platform/tenants/${tenantId}`);
  }

  create(command: CreateTenantCommand): Observable<CreateTenantResult> {
    return this.http.post('/api/v1/platform/tenants', command);
  }

  update(tenantId: string, command: UpdateTenantCommand): Observable<TenantResponse> {
    return this.http.put(`/api/v1/platform/tenants/${tenantId}`, command);
  }

  activate(tenantId: string): Observable<TenantResponse> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/activate`);
  }

  suspend(tenantId: string): Observable<TenantResponse> {
    return this.http.post(`/api/v1/platform/tenants/${tenantId}/suspend`);
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
