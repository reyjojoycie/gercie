// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // Remplacer par le DSN de votre projet Sentry
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',

  // Échantillonnage plus agressif côté serveur (moins de volume)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Désactiver en développement
  enabled: process.env.NODE_ENV === 'production',

  // Environnement
  environment: process.env.NODE_ENV || 'development',

  // Ignorer les erreurs de type "Non-Error"
  ignoreErrors: ['Non-Error promise rejection captured'],

  // Délai avant d'envoyer les événements (permet de regrouper)
  beforeSend(event, hint) {
    // Exclure les erreurs de validation Zod / données utilisateur (évite le bruit)
    if (event.message?.includes('Validation error')) {
      return null
    }
    return event
  },

  // Activer le profiling
  profilesSampleRate: 0.3,
})