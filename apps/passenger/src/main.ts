import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { AUTH_STORAGE_KEY, authInterceptor } from '@vexto/auth';
import { VX_NOTIFICATION_LINKS } from '@vexto/layouts';
import { PhotoSource } from '@vexto/api-client';
import { VX_PHOTO_RESOLVER } from '@vexto/ui';
import { VEXTO_CONFIG, loadRuntimeConfig } from '@vexto/utilities';
import { App } from './app/app';
import { routes } from './app/app.routes';

async function bootstrap(): Promise<void> {
  const config = await loadRuntimeConfig();

  const appConfig: ApplicationConfig = {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZonelessChangeDetection(),
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor])),
      { provide: VEXTO_CONFIG, useValue: config },
      { provide: AUTH_STORAGE_KEY, useValue: 'vexto.passenger.session' },

      // The passenger app has no per-trip screen — the home screen *is* the next trip — and its
      // invoices live under /payments. Both differed from the portal's shapes, which is why these
      // links used to dead-end on Home. See VX_NOTIFICATION_LINKS.
      {
        provide: VX_NOTIFICATION_LINKS,
        useValue: (target: 'trip' | 'invoice', id: string) =>
          target === 'invoice' ? `/payments/${id}` : null,
      },

      // Lets <vx-avatar> fetch an authorized photo without @vexto/ui depending on the API client.
      // See VX_PHOTO_RESOLVER.
      {
        provide: VX_PHOTO_RESOLVER,
        useFactory: (photos: PhotoSource) => (path: string) => photos.get(path),
        deps: [PhotoSource],
      },
      // App-shell caching only. Authenticated API responses are never cached: a passenger must never
      // be shown a stale bus position because the network dipped.
      provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000',
      }),
    ],
  };

  await bootstrapApplication(App, appConfig);
}

void bootstrap();
