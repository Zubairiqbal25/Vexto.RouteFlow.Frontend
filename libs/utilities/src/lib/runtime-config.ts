import { InjectionToken } from '@angular/core';

/**
 * Everything an app needs to know about the environment it is running in.
 *
 * This is loaded from `/config.json` at start-up rather than baked into the bundle, so one built
 * artefact can be promoted from staging to production. Nothing secret belongs here — a browser
 * config file is public by definition. The Google Maps key is a public, referrer-restricted key.
 */
export interface VextoRuntimeConfig {
  /** Base address of the Vexto API, without a trailing slash. */
  readonly apiBaseUrl: string;
  /** Absolute or relative URL of the SignalR tracking hub. */
  readonly trackingHubUrl: string;
  /** Public, HTTP-referrer-restricted Google Maps browser key. Empty disables map rendering. */
  readonly googleMapsApiKey: string;
  /** Seconds between driver position publishes while a trip is running. */
  readonly driverLocationIntervalSeconds: number;
  /** A position older than this is shown as stale rather than live. */
  readonly staleLocationAfterSeconds: number;

  /**
   * Firebase web configuration for push notifications.
   *
   * Public by definition — a browser config file is readable by anyone — and that is fine: these
   * values identify the project, they do not authorise anything. Sending a notification needs the
   * service-account key, which lives only on the server. Leave `firebase.apiKey` empty and the apps
   * hide the "Enable notifications" control entirely rather than offering something that cannot work.
   */
  readonly firebase: VextoFirebaseConfig;

  /**
   * The payment provider's browser configuration.
   *
   * <b>The publishable key only, and that is the whole point.</b> It identifies the Stripe account
   * and can create payment methods; it cannot create a charge, move money or read anything. The
   * secret key lives on the server and must never appear in a config file a browser downloads.
   *
   * Leave it empty and the passenger app hides the Pay button rather than offering a payment sheet
   * that cannot open.
   */
  readonly stripe: VextoStripeConfig;
}

export interface VextoStripeConfig {
  readonly publishableKey: string;
}

export interface VextoFirebaseConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly messagingSenderId: string;
  readonly appId: string;

  /** The public half of the VAPID key pair, from Firebase Cloud Messaging settings. */
  readonly vapidKey: string;
}

export const VEXTO_CONFIG = new InjectionToken<VextoRuntimeConfig>('VEXTO_CONFIG');

const defaults: VextoRuntimeConfig = {
  apiBaseUrl: 'https://localhost:7154',
  trackingHubUrl: 'https://localhost:7154/hubs/tracking',
  googleMapsApiKey: '',
  driverLocationIntervalSeconds: 5,
  staleLocationAfterSeconds: 45,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    messagingSenderId: '',
    appId: '',
    vapidKey: '',
  },
  stripe: {
    publishableKey: '',
  },
};

/**
 * Reads `/config.json` before Angular bootstraps.
 *
 * A missing or unreadable file is not fatal: the defaults point at the local development API, which
 * is what a developer who has not written a config file wants.
 */
export async function loadRuntimeConfig(): Promise<VextoRuntimeConfig> {
  try {
    const response = await fetch('config.json', { cache: 'no-cache' });

    if (!response.ok) {
      return defaults;
    }

    const loaded = (await response.json()) as Partial<VextoRuntimeConfig>;

    // Merged one level deep for `firebase`, so a config file that omits it — or sets only some of
    // it — still produces a complete object rather than an undefined the apps have to guard.
    return {
      ...defaults,
      ...loaded,
      firebase: { ...defaults.firebase, ...(loaded.firebase ?? {}) },
      stripe: { ...defaults.stripe, ...(loaded.stripe ?? {}) },
    };
  } catch {
    return defaults;
  }
}
