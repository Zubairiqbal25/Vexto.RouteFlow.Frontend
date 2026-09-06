import { Injectable, inject } from '@angular/core';
import { VEXTO_CONFIG } from '@vexto/utilities';

/**
 * Loads the map provider's SDK, once, on demand.
 *
 * On demand because only two screens in the whole product show a map, and making every other page
 * pay for a third-party script is the sort of thing that quietly costs a second of load time.
 *
 * The key comes from runtime config, never from the bundle. It is a public browser key and must be
 * restricted by HTTP referrer in the Google Cloud console — that restriction, not secrecy, is what
 * protects it.
 */
@Injectable({ providedIn: 'root' })
export class MapLoader {
  private readonly config = inject(VEXTO_CONFIG);
  private loading: Promise<boolean> | null = null;

  /** True once the SDK is usable; false when no key is configured or the script failed to load. */
  load(): Promise<boolean> {
    this.loading ??= this.loadOnce();

    return this.loading;
  }

  get isConfigured(): boolean {
    return this.config.googleMapsApiKey.length > 0;
  }

  private loadOnce(): Promise<boolean> {
    if (!this.isConfigured) {
      return Promise.resolve(false);
    }

    if (typeof google !== 'undefined' && google.maps?.Map) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        this.config.googleMapsApiKey,
      )}&libraries=marker&loading=async&v=weekly`;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
}
