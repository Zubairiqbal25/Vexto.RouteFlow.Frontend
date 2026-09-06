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
}

export const VEXTO_CONFIG = new InjectionToken<VextoRuntimeConfig>('VEXTO_CONFIG');

const defaults: VextoRuntimeConfig = {
  apiBaseUrl: 'https://localhost:7154',
  trackingHubUrl: 'https://localhost:7154/hubs/tracking',
  googleMapsApiKey: '',
  driverLocationIntervalSeconds: 5,
  staleLocationAfterSeconds: 45,
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

    return { ...defaults, ...(await response.json()) } as VextoRuntimeConfig;
  } catch {
    return defaults;
  }
}
