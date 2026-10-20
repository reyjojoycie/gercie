// lib/logger.ts
/**
 * Logger pour Gercie.
 *
 * Compatibilité totale avec l'existant :
 *  - `logger.error('message', context?)`
 *  - `logger.error({ userId, ... })` avec un objet en premier argument
 *  - `logger.error(uneErreur)` avec une Error directement
 *  - `GercieLogger.error(...)` (méthodes statiques)
 *
 * Corrections de cette version :
 *  - l'objet Error n'est plus perdu (Sentry reçoit bien captureException)
 *  - plus de fuite de données sensibles dans le message quand on logge un objet
 *  - masquage récursif sûr (objets "plain" uniquement, protégé contre les références circulaires)
 *  - import `uuid` inutilisé supprimé
 *  - méthodes statiques déléguées à l'instance par défaut (même règle Sentry)
 */

import * as Sentry from '@sentry/nextjs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

// `any` volontaire : `Record<string, unknown>` refuse les variables typées par
// une `interface` (« Index signature is missing in type »).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogContext = Record<string, any>

export type LogEntry = {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
  error?: Error
}

// Le premier argument peut être :
//  - une string (usage classique)
//  - un objet de contexte (usage dans les routes API)
//  - une Error
export type LogFirstArg = string | LogContext | Error

export interface Logger {
  error(first: LogFirstArg, context?: LogContext | Error): void
  warn(first: LogFirstArg, context?: LogContext | Error): void
  info(first: LogFirstArg, context?: LogContext | Error): void
  debug(first: LogFirstArg, context?: LogContext | Error): void
  trace(first: LogFirstArg, context?: LogContext | Error): void
  child(context: LogContext): Logger
}

// Options de configuration
interface LoggerOptions {
  level?: LogLevel
  pretty?: boolean          // Active le format lisible (dev)
  enableSentry?: boolean    // Active l'envoi vers Sentry
  maskSensitive?: boolean   // Masque les champs sensibles
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
}

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'apiKey']
const SENSITIVE_REPLACEMENT = '***MASKED***'

// Message utilisé quand on logge un objet sans champ message/msg/error.
// On ne sérialise JAMAIS l'objet dans le message : il contiendrait les
// champs sensibles en clair (le masquage ne s'applique qu'au contexte).
const DEFAULT_MESSAGE = 'Log event'

// Couleurs ANSI (uniquement en mode pretty)
const COLOR_MAP: Record<LogLevel, string> = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m',
  trace: '\x1b[35m',
}
const RESET_COLOR = '\x1b[0m'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Évite les références circulaires dans JSON.stringify
function safeReplacer() {
  const seen = new WeakSet()
  return (_key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  }
}

function isPlainObject(value: unknown): value is LogContext {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// ---------------------------------------------------------------------------
// Classe du Logger
// ---------------------------------------------------------------------------
class GercieLogger implements Logger {
  private levelValue: number
  private baseContext: LogContext
  private options: Required<LoggerOptions>

  constructor(context: LogContext = {}, options: LoggerOptions = {}) {
    const level = options.level ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info'
    this.levelValue = LEVEL_ORDER[level] ?? 30
    this.options = {
      level: level as LogLevel,
      pretty: options.pretty ?? process.env.NODE_ENV === 'development',
      enableSentry: options.enableSentry ?? true,
      maskSensitive: options.maskSensitive ?? true,
    }
    this.baseContext = context
  }

  // Crée un enfant avec contexte supplémentaire
  child(context: LogContext): Logger {
    const merged = { ...this.baseContext, ...context }
    return new GercieLogger(merged, {
      level: this.options.level,
      pretty: this.options.pretty,
      enableSentry: this.options.enableSentry,
      maskSensitive: this.options.maskSensitive,
    })
  }

  error(first: LogFirstArg, context?: LogContext | Error): void {
    this.log('error', first, context)
  }
  warn(first: LogFirstArg, context?: LogContext | Error): void {
    this.log('warn', first, context)
  }
  info(first: LogFirstArg, context?: LogContext | Error): void {
    this.log('info', first, context)
  }
  debug(first: LogFirstArg, context?: LogContext | Error): void {
    this.log('debug', first, context)
  }
  trace(first: LogFirstArg, context?: LogContext | Error): void {
    this.log('trace', first, context)
  }

  // Méthodes statiques : `GercieLogger.error(...)` sans instancier.
  // Elles délèguent à l'instance par défaut (définie plus bas), donc elles
  // respectent la même configuration (niveau, Sentry activé seulement si DSN...).
  static error(first: LogFirstArg, context?: LogContext | Error): void {
    defaultLogger.error(first, context)
  }
  static warn(first: LogFirstArg, context?: LogContext | Error): void {
    defaultLogger.warn(first, context)
  }
  static info(first: LogFirstArg, context?: LogContext | Error): void {
    defaultLogger.info(first, context)
  }
  static debug(first: LogFirstArg, context?: LogContext | Error): void {
    defaultLogger.debug(first, context)
  }
  static trace(first: LogFirstArg, context?: LogContext | Error): void {
    defaultLogger.trace(first, context)
  }

  // Méthode interne de logging
  private log(level: LogLevel, first: LogFirstArg, second?: LogContext | Error): void {
    if (LEVEL_ORDER[level] < this.levelValue) return

    const { message, extra } = this.normalizeArgs(first, second)

    const entry = this.buildEntry(level, message, extra)
    this.writeToConsole(entry)
    this.sendToSentry(level, entry)
  }

  // Transforme n'importe quel appel en { message, extra }
  private normalizeArgs(
    first: LogFirstArg,
    second?: LogContext | Error
  ): { message: string; extra?: LogContext | Error } {
    // Cas 1 : string classique → logger.error('message', context?)
    if (typeof first === 'string') {
      return { message: first, extra: second }
    }

    // Cas 2 : une Error directement → logger.error(erreur)
    if (first instanceof Error) {
      const extra: LogContext = second && !(second instanceof Error) ? { ...second } : {}
      extra.error = first
      return { message: first.message, extra }
    }

    // Cas 3 : un objet en premier argument → logger.error({ userId, ... })
    // On extrait "message"/"msg"/"error" si présent, le reste devient le contexte.
    const { message: m, msg, error: e, ...rest } = first as LogContext

    let message: string
    if (typeof m === 'string') message = m
    else if (typeof msg === 'string') message = msg
    else if (e instanceof Error) message = e.message
    else message = DEFAULT_MESSAGE // jamais JSON.stringify(first) : fuite de données sensibles

    const extra: LogContext = { ...rest }
    if (e instanceof Error) extra.error = e
    else if (e !== undefined) extra.error = e
    if (second instanceof Error) extra.error = second
    else if (second) Object.assign(extra, second)

    return { message, extra: Object.keys(extra).length > 0 ? extra : undefined }
  }

  // Construction de l'entrée de log
  private buildEntry(level: LogLevel, message: string, extra?: LogContext | Error): LogEntry {
    let context: LogContext | undefined
    let error: Error | undefined

    if (extra instanceof Error) {
      error = extra
    } else if (extra) {
      // On sort l'objet Error du contexte AVANT le masquage : sinon il serait
      // transformé en `{}` (propriétés non énumérables) et Sentry ne recevrait
      // jamais captureException.
      const { error: maybeErr, ...rest } = extra
      if (maybeErr instanceof Error) error = maybeErr
      else if (maybeErr !== undefined) rest.error = maybeErr
      context = this.maskSensitiveFields(rest)
    }

    const mergedContext = context
      ? { ...this.baseContext, ...context }
      : { ...this.baseContext }

    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
      error,
    }
  }

  // Masquage des champs sensibles (récursif, objets "plain" et tableaux uniquement)
  private maskSensitiveFields(obj: LogContext): LogContext {
    if (!this.options.maskSensitive) return obj
    return this.maskObject(obj, new WeakSet<object>())
  }

  private maskObject(obj: LogContext, seen: WeakSet<object>): LogContext {
    seen.add(obj)
    const result: LogContext = {}
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = SENSITIVE_REPLACEMENT
      } else {
        result[key] = this.maskValue(value, seen)
      }
    }
    return result
  }

  private maskValue(value: unknown, seen: WeakSet<object>): unknown {
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
      return value.map(v => this.maskValue(v, seen))
    }
    if (isPlainObject(value)) {
      if (seen.has(value)) return '[Circular]'
      return this.maskObject(value, seen)
    }
    // Date, Map, Error, class instances... : laissés tels quels
    return value
  }

  // Écriture console avec ou sans couleurs
  private writeToConsole(entry: LogEntry): void {
    const { level, message, timestamp, context, error } = entry
    let logMessage: string

    if (this.options.pretty) {
      const color = COLOR_MAP[level] || ''
      const ctxStr = context ? ' ' + JSON.stringify(context, safeReplacer(), 2) : ''
      const errStr = error ? `\n${error.stack || error.message}` : ''
      logMessage = `${color}[${level.toUpperCase()}] ${timestamp} ${message}${RESET_COLOR}${ctxStr}${errStr}`
    } else {
      // Format JSON structuré
      logMessage = JSON.stringify(
        {
          level,
          message,
          timestamp,
          context,
          error: error ? { message: error.message, stack: error.stack } : undefined,
        },
        safeReplacer()
      )
    }

    switch (level) {
      case 'error': console.error(logMessage); break
      case 'warn': console.warn(logMessage); break
      case 'info': console.info(logMessage); break
      case 'debug': console.debug(logMessage); break
      default: console.log(logMessage)
    }
  }

  // Envoi vers Sentry
  private sendToSentry(level: LogLevel, entry: LogEntry): void {
    if (!this.options.enableSentry) return

    try {
      if (level === 'error' && entry.error) {
        Sentry.captureException(entry.error, {
          extra: entry.context,
          tags: { level: entry.level },
        })
      } else if (level === 'error') {
        Sentry.captureMessage(entry.message, {
          level: 'error',
          extra: entry.context,
        })
      } else if (level === 'warn') {
        Sentry.captureMessage(entry.message, {
          level: 'warning',
          extra: entry.context,
        })
      } else {
        // Breadcrumb pour les niveaux inférieurs
        Sentry.addBreadcrumb({
          message: entry.message,
          level: level === 'info' ? 'info' : 'debug',
          data: entry.context,
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      // Silencieux : ne pas crasher si Sentry n'est pas configuré
      console.warn("Logger: impossible d'envoyer à Sentry", err)
    }
  }
}

// ---------------------------------------------------------------------------
// Instance par défaut (singleton)
// ---------------------------------------------------------------------------
const defaultLogger = new GercieLogger({}, {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  pretty: process.env.NODE_ENV === 'development',
  enableSentry: !!process.env.NEXT_PUBLIC_SENTRY_DSN || !!process.env.SENTRY_DSN,
  maskSensitive: true,
})

export default defaultLogger
export { GercieLogger, type LoggerOptions }

// ---------------------------------------------------------------------------
// ALIAS D'EXPORTATION POUR COMPATIBILITÉ
// Permet : import { logger } from '@/lib/logger'
// ---------------------------------------------------------------------------
export const logger = defaultLogger
export const loggerInfo = defaultLogger.info.bind(defaultLogger)
export const loggerError = defaultLogger.error.bind(defaultLogger)
export const loggerWarn = defaultLogger.warn.bind(defaultLogger)
export const loggerDebug = defaultLogger.debug.bind(defaultLogger)
export const loggerTrace = defaultLogger.trace.bind(defaultLogger)