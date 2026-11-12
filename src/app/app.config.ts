import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHighcharts } from 'highcharts-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHighcharts({
      instance: () => import('highcharts/esm/highcharts.js').then((m) => m.default),
      modules: () => [import('highcharts/esm/modules/accessibility.js')],
      options: {
        credits: { enabled: false },
        chart: {
          backgroundColor: 'transparent',
          style: {
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          },
        },
        title: { text: undefined },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#1e293b',
          borderRadius: 8,
          style: {
            color: '#f8fafc',
            fontSize: '12px',
          },
        },
      },
    }),
  ],
};
