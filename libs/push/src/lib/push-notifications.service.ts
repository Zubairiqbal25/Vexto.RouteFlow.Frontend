import { Injectable, computed, inject, signal } from '@angular/core';
import { PushDevicesApi } from '@vexto/api-client';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Where the browser stands on notifications, from this app's point of view.
 */
export type PushState =
  /** No Firebase config, or the browser has no service worker or push support. */
  | 'unsupported'
  /** Available, and the person has not been asked. This is the only state that shows a prompt. */
  | 'available'
  /** Asking, or registering with the server.  */
  | 'enabling'
  /** Registered. */
  | 'enabled'
  /** The person said no, or the browser is blocking. Nothing more is asked of them. */
  | 'denied'
  /** Something went wrong registering. Retryable. */
  | 'failed';

const FirebaseCdn = 'https://www.gstatic.com/firebasejs/10.12.2';

/** Only the two entry points this file calls. Not a binding to the whole SDK. */
interface FirebaseAppModule {
  initializeApp(config: Record<string, string>): unknown;
  getApps(): unknown[];
}

interface FirebaseMessagingModule {
  getMessaging(app: unknown): unknown;
  getToken(
    messaging: unknown,
    options: { vapidKey: string; serviceWorkerRegistration: ServiceWorkerRegistration },
  ): Promise<string>;
}

/**
 * Imports an ES module from a URL the compiler must not try to resolve.
 *
 * A plain `import('https://…')` fails to type-check — TypeScript looks for local declarations for
 * the specifier — and a bundler would try to inline it. Going through `Function` keeps the
 * specifier opaque to both, which is exactly what is wanted for a CDN module loaded on demand.
 *
 * The URL is a constant in this file and never comes from anywhere else, so nothing about this is
 * dynamic in the dangerous sense.
 */
function loadModule<T>(url: string): Promise<T> {
  const dynamicImport = new Function('specifier', 'return import(specifier);') as (
    specifier: string,
  ) => Promise<T>;

  return dynamicImport(url);
}

/**
 * Turns browser push on for the signed-in person, and registers the resulting token with Vexto.
 *
 * **Nothing happens until somebody asks for it.** `enable()` is called from a button press and
 * never on page load. A site that fires the browser's permission prompt the moment it opens gets
 * denied — usually permanently, because the browser remembers — and denial is the one state that
 * cannot be undone from inside the page. Asking once, after the person has said they want it, is
 * the only approach that works.
 *
 * **A denial is final and is treated as such.** There is no retry, no second prompt and no nagging
 * banner: the UI says notifications are blocked in browser settings and stops.
 *
 * The Firebase SDK is loaded on demand from a CDN rather than bundled. Only two of the three apps
 * use push, only some of their users enable it, and the messaging SDK is a large dependency to put
 * in front of everybody who opens a trip list.
 */
@Injectable({ providedIn: 'root' })
export class PushNotifications {
  /** Where the browser stores the fact that this device is already registered. */
  private static readonly StorageKey = 'vexto.push.device';

  private readonly config = inject(VEXTO_CONFIG);
  private readonly api = inject(PushDevicesApi);

  private readonly stateSignal = signal<PushState>('available');

  readonly state = this.stateSignal.asReadonly();

  /** Whether to offer the control at all. */
  readonly isSupported = computed(() => this.stateSignal() !== 'unsupported');

  constructor() {
    this.stateSignal.set(this.initialState());
  }

  /**
   * Asks the browser for permission, obtains a messaging token, and registers it with Vexto.
   *
   * Call from a user gesture only.
   */
  async enable(): Promise<void> {
    if (this.stateSignal() === 'enabling' || this.stateSignal() === 'unsupported') {
      return;
    }

    this.stateSignal.set('enabling');

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        // Denied, or dismissed. Either way the browser will not ask again from script, so neither
        // do we.
        this.stateSignal.set('denied');

        return;
      }

      const token = await this.obtainToken();

      if (!token) {
        this.stateSignal.set('failed');

        return;
      }

      const device = await this.registerAsync(token);

      // Remembered so the app can show "on" without asking the server on every load. It is the
      // device id, never the token.
      this.remember(device.id);
      this.stateSignal.set('enabled');
    } catch {
      // Includes a blocked SDK, an unreachable API and a browser that refuses a service worker.
      // The person is offered a retry rather than an explanation they cannot act on.
      this.stateSignal.set('failed');
    }
  }

  /**
   * Re-registers a device that is already permitted.
   *
   * Safe to call on start-up, because it asks the browser for nothing: it returns immediately
   * unless permission has already been granted. Firebase rotates tokens on its own schedule, so a
   * device that registered last month may be carrying a token the provider no longer honours.
   */
  async refresh(): Promise<void> {
    if (this.stateSignal() === 'unsupported' || Notification.permission !== 'granted') {
      return;
    }

    try {
      const token = await this.obtainToken();

      if (!token) {
        return;
      }

      const device = await this.registerAsync(token);

      this.remember(device.id);
      this.stateSignal.set('enabled');
    } catch {
      // A failed refresh is not worth telling anybody about: the previous registration is still
      // there, and the next load tries again.
    }
  }

  /** Stops notifications on this device, and tells the server to stop sending to it. */
  async disable(): Promise<void> {
    const deviceId = this.rememberedDeviceId();

    if (deviceId) {
      try {
        await new Promise<void>((resolve, reject) =>
          this.api.remove(deviceId).subscribe({ next: () => resolve(), error: reject }),
        );
      } catch {
        // The row may already be gone. Either way the local state should stop claiming it is on.
      }
    }

    this.forget();

    // Back to 'available' rather than 'denied': the browser permission is still granted, so
    // turning it on again costs one tap and no prompt.
    this.stateSignal.set('available');
  }

  private initialState(): PushState {
    const configured = this.config.firebase.apiKey.length > 0
      && this.config.firebase.vapidKey.length > 0;

    if (!configured) {
      return 'unsupported';
    }

    if (
      typeof Notification === 'undefined'
      || !('serviceWorker' in navigator)
      || !('PushManager' in window)
    ) {
      return 'unsupported';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    if (Notification.permission === 'granted' && this.rememberedDeviceId()) {
      return 'enabled';
    }

    return 'available';
  }

  /**
   * Loads the Firebase messaging SDK and asks it for a registration token.
   *
   * The SDK is fetched from the CDN as an ES module, so nothing is bundled and nothing is loaded
   * for a person who never enables notifications.
   */
  private async obtainToken(): Promise<string | null> {
    const { apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey } =
      this.config.firebase;

    const [appModule, messagingModule] = await Promise.all([
      loadModule<FirebaseAppModule>(`${FirebaseCdn}/firebase-app.js`),
      loadModule<FirebaseMessagingModule>(`${FirebaseCdn}/firebase-messaging.js`),
    ]);

    const { initializeApp, getApps } = appModule;
    const { getMessaging, getToken } = messagingModule;

    // Reused rather than re-initialised: calling initializeApp twice throws.
    const app = getApps().length > 0
      ? getApps()[0]
      : initializeApp({ apiKey, authDomain, projectId, messagingSenderId, appId });

    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  private registerAsync(token: string) {
    return new Promise<{ id: string }>((resolve, reject) =>
      this.api
        .register({
          deviceToken: token,
          platform: 'Web',

          // A rough, non-identifying label so somebody with several devices can tell them apart in
          // their own device list.
          label: this.describeBrowser(),
        })
        .subscribe({ next: (device) => resolve(device), error: reject }),
    );
  }

  private describeBrowser(): string {
    const agent = navigator.userAgent;

    const browser = agent.includes('Edg')
      ? 'Edge'
      : agent.includes('Chrome')
        ? 'Chrome'
        : agent.includes('Firefox')
          ? 'Firefox'
          : agent.includes('Safari')
            ? 'Safari'
            : 'Browser';

    const platform = /Android|iPhone|iPad|Mobile/u.test(agent) ? 'phone' : 'computer';

    return `${browser} on this ${platform}`;
  }

  /** The device id only. The provider token is never stored in the browser by this app. */
  private rememberedDeviceId(): string | null {
    try {
      return localStorage.getItem(PushNotifications.StorageKey);
    } catch {
      // Private browsing, or storage disabled. The app still works; it just re-registers.
      return null;
    }
  }

  private remember(deviceId: string): void {
    try {
      localStorage.setItem(PushNotifications.StorageKey, deviceId);
    } catch {
      // Not worth surfacing: the registration succeeded, only the shortcut is unavailable.
    }
  }

  private forget(): void {
    try {
      localStorage.removeItem(PushNotifications.StorageKey);
    } catch {
      // As above.
    }
  }
}
