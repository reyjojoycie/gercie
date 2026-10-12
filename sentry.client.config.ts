// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // Remplacer par le DSN de votre projet Sentry
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',

  // Ajuster le taux d'échantillonnage en production
  // 1.0 = 100 %, 0.5 = 50 %, etc.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.5,
  replaysOnErrorSampleRate: 1.0,

  // Intégrations recommandées pour le navigateur
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserProfilingIntegration(),
  ],

  // Désactiver en développement pour éviter de polluer les logs
  enabled: process.env.NODE_ENV === 'production',

  // Configurer l'environnement
  environment: process.env.NODE_ENV || 'development',

  // Ignorer les erreurs provenant de certaines extensions ou navigateurs
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured with value: Object',
  ],

  // Activer le suivi des performances
  enableTracing: true,

  // Taux d'échantillonnage des profils
  profilesSampleRate: 0.5,
})