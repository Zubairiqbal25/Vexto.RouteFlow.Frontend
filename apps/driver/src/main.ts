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
