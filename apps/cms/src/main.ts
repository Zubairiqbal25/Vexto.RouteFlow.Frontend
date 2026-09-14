import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { PhotoSource } from '@vexto/api-client';
import { AUTH_STORAGE_KEY, authInterceptor } from '@vexto/auth';
import { VX_PHOTO_RESOLVER } from '@vexto/ui';
import { VEXTO_CONFIG, loadRuntimeConfig } from '@vexto/utilities';
import { App } from './app/app';
import { routes } from './app/app.routes';

/**
 * The CMS: Vexto's own staff managing platform content.
 *
 * Same runtime configuration, same sign-in, same shell as the operator portal — it is the fourth
 * app in the workspace, not a fourth way of doing things. What it deliberately lacks is the tenant
 * context interceptor: templates are platform-global, so there is no tenant to enter.
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
      { provide: AUTH_STORAGE_KEY, useValue: 'vexto.cms.session' },

      // Tenant logos are served from an authorized endpoint; the avatar fetches them through the
      // API client rather than linking to them. See VX_PHOTO_RESOLVER.
      {
        provide: VX_PHOTO_RESOLVER,
        useFactory: (photos: PhotoSource) => (path: string) => photos.get(path),
        deps: [PhotoSource],
      },
    ],
  };

  await bootstrapApplication(App, appConfig);
}

void bootstrap();
