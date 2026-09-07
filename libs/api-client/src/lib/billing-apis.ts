import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  BillingSummary,
  CreatePassengerSubscriptionRequest,
  GenerateInvoiceBatchRequest,
  GenerateInvoiceBatchResponse,
  GenerateInvoiceRequest,
  PagedResult,
  PassengerInvoice,
  PassengerInvoiceStatus,
  PassengerSubscription,
  PassengerSubscriptionStatus,
  Payment,
  PaymentAccount,
  PaymentRefund,
  PaymentStatus,
  RefundRequest,
  TenantPaymentSettings,
  TenantSubscription,
  UpdatePassengerSubscriptionRequest,
  UpdateTenantPaymentSettingsRequest,
} from '@vexto/models';
import { VextoHttp } from './vexto-http';

/**
 * What passengers owe this operator: their transport arrangements and the invoices raised from
 * them.
 *
 * Separate from {@link VextoSubscriptionApi} below, which is what the operator owes Vexto. The two
 * are different money belonging to different people and they share nothing — see
 * Backend/docs/billing.md.
 */
@Injectable({ providedIn: 'root' })
export class PassengerBillingApi {
  private readonly http = inject(VextoHttp);

  subscriptions(query: {
    passengerId?: string;
    routeId?: string;
    status?: PassengerSubscriptionStatus;
    search?: string;
    pageNumber?: number;
    pageSize?: number;
  } = {}): Observable<PagedResult<PassengerSubscription>> {
    return this.http.get('/api/v1/passenger-subscriptions', { ...query });
  }

  subscription(subscriptionId: string): Observable<PassengerSubscription> {
    return this.http.get(`/api/v1/passenger-subscriptions/${subscriptionId}`);
  }

  createSubscription(
    request: CreatePassengerSubscriptionRequest,
  ): Observable<PassengerSubscription> {
    return this.http.post('/api/v1/passenger-subscriptions', request);
  }

  updateSubscription(
    subscriptionId: string,
    request: UpdatePassengerSubscriptionRequest,
  ): Observable<PassengerSubscription> {
    return this.http.put(`/api/v1/passenger-subscriptions/${subscriptionId}`, request);
  }

  activateSubscription(subscriptionId: string): Observable<void> {
    return this.http.post(`/api/v1/passenger-subscriptions/${subscriptionId}/activate`);
  }

  pauseSubscription(subscriptionId: string): Observable<void> {
    return this.http.post(`/api/v1/passenger-subscriptions/${subscriptionId}/pause`);
  }

  cancelSubscription(subscriptionId: string): Observable<void> {
    return this.http.post(`/api/v1/passenger-subscriptions/${subscriptionId}/cancel`);
  }

  /**
   * Raises the invoice for one billing period.
   *
   * Idempotent on the server: asking twice for the same period returns the invoice that already
   * exists rather than billing the passenger twice. A double-clicked button is harmless.
   */
  generateInvoice(
    subscriptionId: string,
    request: GenerateInvoiceRequest,
  ): Observable<PassengerInvoice> {
    return this.http.post(
      `/api/v1/passenger-subscriptions/${subscriptionId}/generate-invoice`,
      request,
    );
  }

  invoices(query: {
    passengerId?: string;
    status?: PassengerInvoiceStatus;
    fromDate?: string;
    toDate?: string;
    search?: string;
    pageNumber?: number;
    pageSize?: number;
  } = {}): Observable<PagedResult<PassengerInvoice>> {
    return this.http.get('/api/v1/passenger-invoices', { ...query });
  }

  invoice(invoiceId: string): Observable<PassengerInvoice> {
    return this.http.get(`/api/v1/passenger-invoices/${invoiceId}`);
  }

  generateInvoices(
    request: GenerateInvoiceBatchRequest,
  ): Observable<GenerateInvoiceBatchResponse> {
    return this.http.post('/api/v1/passenger-invoices/generate', request);
  }

  cancelInvoice(invoiceId: string): Observable<void> {
    return this.http.post(`/api/v1/passenger-invoices/${invoiceId}/cancel`);
  }

  summary(): Observable<BillingSummary> {
    return this.http.get('/api/v1/billing/summary');
  }
}

/** Money that has moved: reconciliation and refunds. */
@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly http = inject(VextoHttp);

  list(query: {
    passengerId?: string;
    invoiceId?: string;
    status?: PaymentStatus;
    fromDate?: string;
    toDate?: string;
    search?: string;
    pageNumber?: number;
    pageSize?: number;
  } = {}): Observable<PagedResult<Payment>> {
    return this.http.get('/api/v1/payments', { ...query });
  }

  refunds(paymentId: string): Observable<PaymentRefund[]> {
    return this.http.get(`/api/v1/payments/${paymentId}/refunds`);
  }

  /** Omit the amount for a full refund. The server caps it at what is still refundable. */
  refund(paymentId: string, request: RefundRequest): Observable<PaymentRefund> {
    return this.http.post(`/api/v1/payments/${paymentId}/refund`, request);
  }
}

/**
 * The operator's account with the payment provider.
 *
 * Note what is missing: there is no way to send a provider account id. Vexto creates the account
 * and owns the relationship, so there is nothing for a client to supply — and no way for an
 * operator to attach somebody else's account and collect their passengers' fares.
 */
@Injectable({ providedIn: 'root' })
export class PaymentAccountApi {
  private readonly http = inject(VextoHttp);

  get(): Observable<PaymentAccount> {
    return this.http.get('/api/v1/payment-account');
  }

  /** Takes no body. Every field comes from the tenant record on the server. */
  connect(): Observable<PaymentAccount> {
    return this.http.post('/api/v1/payment-account');
  }

  /** A short-lived, single-use link to the provider. Never stored — it authenticates its follower. */
  onboardingLink(returnUrl: string, refreshUrl: string): Observable<{ url: string }> {
    return this.http.post('/api/v1/payment-account/onboarding-link', { returnUrl, refreshUrl });
  }

  refresh(): Observable<PaymentAccount> {
    return this.http.post('/api/v1/payment-account/refresh');
  }

  settings(): Observable<TenantPaymentSettings> {
    return this.http.get('/api/v1/payment-account/settings');
  }

  updateSettings(
    request: UpdateTenantPaymentSettingsRequest,
  ): Observable<TenantPaymentSettings> {
    return this.http.put('/api/v1/payment-account/settings', request);
  }
}

/** What this operator owes Vexto, and how much of their plan they are using. */
@Injectable({ providedIn: 'root' })
export class VextoSubscriptionApi {
  private readonly http = inject(VextoHttp);

  get(): Observable<TenantSubscription> {
    return this.http.get('/api/v1/billing/subscription');
  }
}
