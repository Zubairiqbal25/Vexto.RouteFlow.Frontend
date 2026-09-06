import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { AUTH_STORAGE_KEY, authInterceptor } from '@vexto/auth';
import { VEXTO_CONFIG, loadRuntimeConfig } from '@vexto/utilities';
import { App } from './app/app';
import { routes } from './app/app.routes';

/**
 * Runtime configuration is fetched before Angular starts.
 *
 * Doing it here rather than in an initializer means `VEXTO_CONFIG` is a plain value everywhere —
 * no service has to cope with a config that is not there yet.
 */
async function bootstrap(): Promise<void> {
  const config = await loadRuntimeConfig();

  const appConfig: ApplicationConfig = {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZonelessChangeDetection(),
      provideRouter(
        routes,
        withComponentInputBinding(),
        withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      ),
      provideHttpClient(withInterceptors([authInterceptor])),
      { provide: VEXTO_CONFIG, useValue: config },
      { provide: AUTH_STORAGE_KEY, useValue: 'vexto.operator.session' },
    ],
  };

  await bootstrapApplication(App, appConfig);
}

void bootstrap();
