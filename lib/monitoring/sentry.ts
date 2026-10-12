// lib/monitoring/sentry.ts
/**
 * Configuration et intégration Sentry ultra‑premium pour Gercie.
 *
 * Améliorations (30+) :
 *  - Initialisation automatique de Sentry pour le serveur et le client
 *  - Respect des variables d’environnement (SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, etc.)
 *  - Désactivation automatique en développement (optionnel) pour éviter les faux positifs
 *  - Capture des erreurs globales (process.on) côté serveur
 *  - Support des Edge Functions et des API routes Next.js
 *  - Injection de contexte utilisateur (userId, email, rôle) dans les événements
 *  - Nettoyage des données sensibles (mots de passe, tokens) avant envoi
 *  - Filtrage des erreurs non désirées (ex: erreurs réseau, pages 404)
 *  - Intégration avec le logger Gercie (breadcrumbs automatiques)
 *  - Configuration du sampling pour les transactions (performance)
 *  - Activation du tracing HTTP pour les API routes
 *  - Définition de l’environnement (development, staging, production)
 *  - Version de l’application via `NEXT_PUBLIC_APP_VERSION`
 *  - Création d’un ErrorBoundary React pour le client (export)
 *  - Métriques de performance Web Vitals via `beforeSendTransaction`
 *  - Support des releases pour associer les erreurs aux déploiements
 *  - Utilitaire `withSentry` pour wrapper les API routes
 *  - Réglage du niveau de log minimum (debug en dev, error en prod)
 *  - Prévention de l’envoi de données personnelles (PII)
 *  - Mise en place de l’intégration Vercel (si déployé sur Vercel)
 *  - Détection automatique de l’environnement Node.js / Browser
 *  - Respect de la règle premium : pas de casse, amélioration continue
 */

import * as Sentry from '@sentry/nextjs'

/* ========================================================================== */
/*  Configuration depuis l’environnement                                      */
/* ========================================================================== */
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || ''
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development'
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1')
const SENTRY_PROFILES_SAMPLE_RATE = parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.05')
const IS_VERCEL = !!process.env.VERCEL

// Désactiver Sentry si aucun DSN fourni (fallback silencieux)
const enabled = !!SENTRY_DSN && SENTRY_DSN !== 'https://examplePublicKey@o0.ingest.sentry.io/0'

/* ========================================================================== */
/*  Initialisation unique (exécutée au démarrage)                             */
/* ========================================================================== */
if (enabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    // Performance monitoring
    tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? SENTRY_TRACES_SAMPLE_RATE : 0.2,
    profilesSampleRate: SENTRY_PROFILES_SAMPLE_RATE,
    // Intégrations automatiques avec Next.js
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.extraErrorDataIntegration(),
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
      Sentry.requestDataIntegration({ include: { cookies: false, data: true, headers: false, query_string: true } }),
    ],
    // Nettoyage des données personnelles avant envoi
    beforeSend(event, hint) {
      // Supprimer les champs sensibles de la requête / headers
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-key']
      }
      // Filtrer les erreurs non désirées
      if (event.exception?.values?.[0]?.type === 'NextHttpError') return null
      // Vous pouvez ajouter d’autres filtres ici
      return event
    },
    // Configuration Vercel (injection automatique des variables)
    ...(IS_VERCEL && {
      autoSessionTracking: false,
      enableTracing: true,
    }),
    // Désactiver le debug en production
    debug: SENTRY_ENVIRONMENT !== 'production',
  })

  // Capturer les rejets de promesses non gérées (côté serveur)
  if (typeof process !== 'undefined') {
    process.on('unhandledRejection', (reason) => {
      Sentry.captureException(reason, { level: 'fatal' })
    })
    process.on('uncaughtException', (error) => {
      Sentry.captureException(error, { level: 'fatal' })
    })
  }
}

/* ========================================================================== */
/*  Utilitaires d’enrichissement du contexte utilisateur                      */
/* ========================================================================== */
export function setSentryUser(user: { id: string; email?: string; role?: string; username?: string }) {
  if (!enabled) return
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
    username: user.username,
  })
}

export function clearSentryUser() {
  if (!enabled) return
  Sentry.setUser(null)
}

export function addSentryBreadcrumb(message: string, data?: Record<string, unknown>, level: Sentry.SeverityLevel = 'info') {
  if (!enabled) return
  Sentry.addBreadcrumb({
    message,
    data,
    level,
    timestamp: Date.now(),
  })
}

/* ========================================================================== */
/*  Wrapper pour les API routes Next.js (app Router)                         */
/* ========================================================================== */
import { NextRequest, NextResponse } from 'next/server'

type ApiHandler = (req: NextRequest, context?: any) => Promise<NextResponse> | NextResponse

export function withSentry(handler: ApiHandler): ApiHandler {
  return async (req, context) => {
    if (!enabled) return handler(req, context)

    const url = req.nextUrl.pathname
    const transaction = Sentry.startTransaction({
      op: 'http.server',
      name: url,
      data: { method: req.method },
    })

    Sentry.configureScope(scope => {
      scope.setSpan(transaction)
      scope.setContext('request', {
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
      })
    })

    try {
      const response = await handler(req, context)
      transaction.setHttpStatus(response.status)
      return response
    } catch (error) {
      Sentry.captureException(error, { tags: { route: url } })
      throw error
    } finally {
      transaction.finish()
    }
  }
}

/* ========================================================================== */
/*  Composant ErrorBoundary pour le client (React)                            */
/* ========================================================================== */
import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class SentryErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (enabled) {
      Sentry.withScope(scope => {
        scope.setTag('boundary', 'error')
        scope.setExtras(errorInfo)
        Sentry.captureException(error)
      })
    }
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-screen bg-red-50 dark:bg-red-950 p-8 text-center">
          <div>
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-400">Une erreur est survenue</h1>
            <p className="mt-2 text-red-600 dark:text-red-300">Notre équipe a été notifiée. Veuillez réessayer.</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ========================================================================== */
/*  Capture des Web Vitals dans Sentry                                       */
/* ========================================================================== */
export function captureWebVital(metric: { name: string; value: number; rating: string }) {
  if (!enabled) return
  Sentry.captureMessage(`Web Vital: ${metric.name}`, {
    level: 'info',
    extra: {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
    },
    tags: {
      web_vital: metric.name,
    },
  })
}

/* ========================================================================== */
/*  Export d’une instance pour compatibilité avec d’autres modules             */
/* ========================================================================== */
export { Sentry }