import { Injectable, inject } from '@angular/core';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Where a payment attempt has got to, from the browser's point of view.
 *
 * <b>None of these is a payment result.</b> `Confirmed` means the provider's own component came
 * back without an error, which is not the same as the money having arrived — the app asks Vexto
 * for that, and Vexto asks the provider. See docs/payments.md.
 */
export type CheckoutOutcome =
  /** The provider accepted the confirmation. Vexto must still be asked what actually happened. */
  | { kind: 'confirmed' }
  /** The payer must do something — 3-D Secure, a bank app — and the provider is handling it. */
  | { kind: 'requiresAction' }
  /** The provider refused, and said something worth showing the payer. */
  | { kind: 'failed'; message: string }
  /** The payment sheet could not be opened at all. */
  | { kind: 'unavailable' };

const StripeCdn = 'https://js.stripe.com/v3/';

/** Only the pieces this file touches. Not a binding to the whole Stripe SDK. */
interface StripeElements {
  create(type: 'payment', options?: Record<string, unknown>): StripeElement;
}

interface StripeElement {
  mount(target: HTMLElement): void;
  unmount(): void;
}

interface StripeInstance {
  elements(options: Record<string, unknown>): StripeElements;
  confirmPayment(options: Record<string, unknown>): Promise<{
    error?: { message?: string; type?: string };
    paymentIntent?: { status?: string };
  }>;
}

type StripeFactory = (publishableKey: string) => StripeInstance;

/**
 * Opens the payment provider's own card component and confirms one payment with it.
 *
 * <b>Vexto never renders a card field.</b> The number, expiry and CVC are typed into an iframe
 * served by the provider, in the payer's browser, and no Vexto server or Vexto script ever sees
 * them — which is what keeps Vexto out of PCI scope and out of the business of holding card data.
 * Apple Pay and Google Pay come along for free, because the provider's component offers whatever
 * the browser and the operator's account support.
 *
 * <b>The publishable key is the only key here.</b> It identifies the Stripe account and can create
 * payment methods; it cannot create charges, move money, or read anything. The secret key never
 * leaves the server.
 *
 * The SDK is loaded from the provider's CDN on demand — it must be, for PCI reasons, and it also
 * means a passenger who never pays in-app never downloads it.
 */
@Injectable({ providedIn: 'root' })
export class StripeCheckout {
  private readonly config = inject(VEXTO_CONFIG);

  private stripe: StripeInstance | null = null;
  private element: StripeElement | null = null;

  /** False when no publishable key is configured, so the UI can hide the whole flow. */
  get isConfigured(): boolean {
    return this.config.stripe.publishableKey.length > 0;
  }

  /**
   * Mounts the provider's payment component into the given container.
   *
   * The client secret authorises confirming this one payment for this one amount. It is safe in a
   * browser and is never logged or stored here — it lives for the length of the visit.
   */
  async mountAsync(container: HTMLElement, clientSecret: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const factory = await this.loadStripeAsync();

      this.stripe ??= factory(this.config.stripe.publishableKey);

      const elements = this.stripe.elements({
        clientSecret,

        // The provider decides what the sheet looks like within these bounds. Vexto supplies a
        // couple of variables rather than a full theme, so an update to the provider's component
        // does not need a matching change here.
        appearance: { theme: 'stripe' },
      });

      this.element = elements.create('payment');
      this.element.mount(container);

      return true;
    } catch {
      // A blocked script, an offline device, a browser refusing a third-party iframe. All the
      // caller can do about any of them is offer another way to pay.
      return false;
    }
  }

  /**
   * Asks the provider to take the payment.
   *
   * `redirect: 'if_required'` keeps the passenger in the app for the ordinary card case and still
   * lets the provider redirect for the methods that need it — a bank app, some wallets. Either
   * way the outcome here is provisional.
   */
  async confirmAsync(returnUrl: string): Promise<CheckoutOutcome> {
    if (!this.stripe) {
      return { kind: 'unavailable' };
    }

    try {
      const result = await this.stripe.confirmPayment({
        elements: undefined,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });

      if (result.error) {
        return {
          kind: 'failed',

          // The provider's own message, which is written for payers and is more useful than
          // anything Vexto could say about somebody else's card.
          message: result.error.message ?? 'Your payment could not be taken.',
        };
      }

      return result.paymentIntent?.status === 'requires_action'
        ? { kind: 'requiresAction' }
        : { kind: 'confirmed' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  /** Removes the provider's component. Called when the sheet is closed. */
  unmount(): void {
    this.element?.unmount();
    this.element = null;
  }

  /**
   * Loads the provider's script and returns its factory.
   *
   * Injected as a script tag rather than imported as a module: the provider serves a classic
   * script that assigns a global, and it must be loaded from their domain — self-hosting it is
   * what puts a site back into PCI scope.
   */
  private loadStripeAsync(): Promise<StripeFactory> {
    const existing = (globalThis as { Stripe?: StripeFactory }).Stripe;

    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<StripeFactory>((resolve, reject) => {
      const script = document.createElement('script');

      script.src = StripeCdn;
      script.async = true;

      script.onload = () => {
        const factory = (globalThis as { Stripe?: StripeFactory }).Stripe;

        return factory ? resolve(factory) : reject(new Error('Stripe did not load.'));
      };

      script.onerror = () => reject(new Error('Stripe could not be reached.'));

      document.head.appendChild(script);
    });
  }
}
