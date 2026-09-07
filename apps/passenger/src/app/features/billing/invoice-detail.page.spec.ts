import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { PassengerInvoicesApi, VextoApiError } from '@vexto/api-client';
import type { PassengerInvoice, Payment, PaymentIntent } from '@vexto/models';
import { StripeCheckout, type CheckoutOutcome } from '@vexto/payments';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassengerInvoiceDetailPage } from './invoice-detail.page';

/**
 * The screen where payment-state authority is visible.
 *
 * The assertions worth having here are all about what the page does *not* say: it must not report
 * a payment as paid because the provider's component returned without an error. That is the single
 * rule the whole payments design turns on, and it lives in a browser where it is easiest to get
 * wrong.
 */
describe('PassengerInvoiceDetailPage', () => {
  const invoice: PassengerInvoice = {
    id: 'invoice-1',
    invoiceNumber: 'INV-2026-000001',
    passengerId: 'passenger-1',
    passengerName: 'Aisha Demo',
    passengerSubscriptionId: 'subscription-1',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    subtotal: 400,
    taxAmount: 20,
    total: 420,
    refundedAmount: 0,
    currency: 'AED',
    status: 'Open',
    dueDate: '2026-03-10',
    paidAtUtc: null,
    items: [],
  };

  const intent: PaymentIntent = {
    paymentId: 'payment-1',
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV-2026-000001',
    amount: 420,
    currency: 'AED',
    status: 'Pending',
    provider: 'fake',
    clientSecret: 'pi_fake_secret',
  };

  const payment: Payment = {
    id: 'payment-1',
    passengerId: 'passenger-1',
    passengerName: '',
    invoiceId: 'invoice-1',
    provider: 'fake',
    providerReference: 'pi_fake_000001',
    amount: 420,
    currency: 'AED',
    platformFee: null,
    providerFee: null,
    netAmount: null,
    refundedAmount: 0,
    status: 'Pending',
    failureCode: null,
    paidAtUtc: null,
    createdAtUtc: '2026-03-01T00:00:00Z',
  };

  let api: {
    invoice: ReturnType<typeof vi.fn>;
    startPayment: ReturnType<typeof vi.fn>;
    payment: ReturnType<typeof vi.fn>;
  };

  let checkout: {
    isConfigured: boolean;
    mountAsync: ReturnType<typeof vi.fn>;
    confirmAsync: ReturnType<typeof vi.fn>;
    unmount: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    api = {
      invoice: vi.fn(() => of(invoice)),
      startPayment: vi.fn(() => of(intent)),
      payment: vi.fn(() => of(payment)),
    };

    checkout = {
      isConfigured: true,
      mountAsync: vi.fn(() => Promise.resolve(true)),
      confirmAsync: vi.fn<() => Promise<CheckoutOutcome>>(() =>
        Promise.resolve({ kind: 'confirmed' })),
      unmount: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PassengerInvoicesApi, useValue: api },
        { provide: StripeCheckout, useValue: checkout },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['invoiceId', 'invoice-1']]) } },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function create(): PassengerInvoiceDetailPage {
    return TestBed.runInInjectionContext(() => new PassengerInvoiceDetailPage());
  }

  it('loads the invoice', () => {
    const page = create() as unknown as { invoice: () => PassengerInvoice | null };

    expect(page.invoice()?.invoiceNumber).toBe('INV-2026-000001');
  });

  it('shows an invoice that is already paid as paid, without asking anything else', () => {
    api.invoice = vi.fn(() => of({ ...invoice, status: 'Paid' as const }));

    const page = create() as unknown as { payState: () => string };

    expect(page.payState()).toBe('paid');
  });

  it('starts a payment without sending an amount', () => {
    const page = create() as unknown as { startPayment: () => void };

    page.startPayment();

    // One argument, the invoice id. There is nowhere on this call to put an amount, which is the
    // point: the server reads it from the invoice.
    expect(api.startPayment).toHaveBeenCalledWith('invoice-1');
    expect(api.startPayment.mock.calls[0]).toHaveLength(1);
  });

  /**
   * The assertion this whole file exists for. The provider said the confirmation went through;
   * that is not the same as the money having arrived, and the screen must not claim it is.
   */
  it('does not report a payment as paid just because the provider confirmed it', async () => {
    const page = create() as unknown as {
      startPayment: () => void;
      confirm: () => Promise<void>;
      payState: () => string;
    };

    page.startPayment();
    await Promise.resolve();
    await page.confirm();

    expect(page.payState()).toBe('pending');
    expect(page.payState()).not.toBe('paid');
  });

  it('reaches paid only when the server says the payment succeeded', async () => {
    const page = create() as unknown as {
      startPayment: () => void;
      confirm: () => Promise<void>;
      payState: () => string;
    };

    page.startPayment();
    await Promise.resolve();
    await page.confirm();

    expect(page.payState()).toBe('pending');

    // Now the server has heard from the provider.
    api.payment = vi.fn(() => of({ ...payment, status: 'Succeeded' as const }));
    api.invoice = vi.fn(() => of({ ...invoice, status: 'Paid' as const }));

    await vi.advanceTimersByTimeAsync(3100);

    expect(page.payState()).toBe('paid');
  });

  it('reports a declined card with the message the provider gave', async () => {
    checkout.confirmAsync = vi.fn<() => Promise<CheckoutOutcome>>(() =>
      Promise.resolve({ kind: 'failed', message: 'Your card was declined.' }));

    const page = create() as unknown as {
      startPayment: () => void;
      confirm: () => Promise<void>;
      payState: () => string;
      failure: () => string;
    };

    page.startPayment();
    await Promise.resolve();
    await page.confirm();

    expect(page.payState()).toBe('failed');
    expect(page.failure()).toBe('Your card was declined.');
  });

  /**
   * A failure the server reports after the browser thought it had gone through — a 3-D Secure
   * check the bank refused. The screen has to move back out of pending.
   */
  it('moves from pending to failed when the server reports a failure', async () => {
    const page = create() as unknown as {
      startPayment: () => void;
      confirm: () => Promise<void>;
      payState: () => string;
    };

    page.startPayment();
    await Promise.resolve();
    await page.confirm();

    api.payment = vi.fn(() => of({ ...payment, status: 'Failed' as const }));

    await vi.advanceTimersByTimeAsync(3100);

    expect(page.payState()).toBe('failed');
  });

  it('shows the server refusal when a payment cannot be started', () => {
    api.startPayment = vi.fn(() =>
      throwError(() => new VextoApiError('validation', 'This operator has not turned on online payments.', 400)));

    const page = create() as unknown as { startPayment: () => void; failure: () => string };

    page.startPayment();

    expect(page.failure()).toBe('This operator has not turned on online payments.');
  });

  /**
   * Polling stops rather than running for ever. A passenger who leaves the page open on a payment
   * that never settles should not have a request loop running behind it all day.
   */
  it('gives up polling after a minute', async () => {
    const pending = new Subject<Payment>();
    api.payment = vi.fn(() => pending.asObservable());

    const page = create() as unknown as {
      startPayment: () => void;
      confirm: () => Promise<void>;
      payState: () => string;
    };

    page.startPayment();
    await Promise.resolve();
    await page.confirm();

    await vi.advanceTimersByTimeAsync(3000 * 25);

    expect(api.payment.mock.calls.length).toBeLessThanOrEqual(20);
    expect(page.payState()).toBe('pending');
  });
});
