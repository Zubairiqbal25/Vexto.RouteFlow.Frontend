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
      { provide: AUTH_STORAGE_KEY, useValue: 'vexto.driver.session' },

      // A driver app has trips and nothing else. An invoice notification would have nowhere to go,
      // so it resolves to null and the row stays readable but unclickable rather than bouncing off
      // the wildcard route into the trip list. See VX_NOTIFICATION_LINKS.
      {
        provide: VX_NOTIFICATION_LINKS,
        useValue: (target: 'trip' | 'invoice', id: string) =>
          target === 'trip' ? `/trips/${id}` : null,
      },

      // Lets <vx-avatar> fetch an authorized photo without @vexto/ui depending on the API client.
      // See VX_PHOTO_RESOLVER.
      {
        provide: VX_PHOTO_RESOLVER,
        useFactory: (photos: PhotoSource) => (path: string) => photos.get(path),
        deps: [PhotoSource],
      },
      // App-shell caching only. Authenticated API responses are never cached: a driver must not be
      // shown yesterday's manifest because the network dipped.
      provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000',
      }),
    ],
  };

  await bootstrapApplication(App, appConfig);
}

void bootstrap();
