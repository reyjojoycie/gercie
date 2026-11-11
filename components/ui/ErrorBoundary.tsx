// components/ui/ErrorBoundary.tsx
'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import {
  AlertTriangle,
  Home,
  RefreshCw,
  Bug,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface ErrorBoundaryProps {
  /** Contenu à protéger */
  children: ReactNode
  /** Fallback personnalisé (remplace le fallback par défaut) */
  fallback?: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode)
  /** Callback appelé quand une erreur est capturée (ex: Sentry) */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /**
   * Clés qui, quand elles changent, réinitialisent automatiquement
   * le boundary (utile pour les routes / filtres).
   */
  resetKeys?: Array<string | number | boolean>
  /** Callback appelé après reset automatique ou manuel */
  onReset?: () => void
  /** Classes additionnelles sur le wrapper du fallback */
  className?: string
  /** Affiche les détails techniques même en production */
  showDetails?: boolean
  /** Message personnalisé pour l'utilisateur */
  message?: string
  /** Titre personnalisé */
  title?: string
}

export interface ErrorBoundaryFallbackProps {
  error: Error
  errorInfo?: ErrorInfo | null
  reset: () => void
  title?: string
  message?: string
  showDetails?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const IS_DEV =
  typeof process !== 'undefined' &&
  process.env?.NODE_ENV === 'development'

function arraysEqual(
  a: Array<string | number | boolean> | undefined,
  b: Array<string | number | boolean> | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }

  return true
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DEFAULT FALLBACK                                               */
/* ═══════════════════════════════════════════════════════════════ */

function DefaultFallback({
  error,
  errorInfo,
  reset,
  title = 'Une erreur est survenue',
  message = 'Quelque chose s’est mal passé. Vous pouvez essayer de rafraîchir la page ou revenir à l’accueil.',
  showDetails = IS_DEV,
}: ErrorBoundaryFallbackProps) {
  return (
    <DefaultFallbackUI
      error={error}
      errorInfo={errorInfo}
      reset={reset}
      title={title}
      message={message}
      showDetails={showDetails}
    />
  )
}

interface DefaultFallbackUIProps {
  error: Error
  errorInfo?: ErrorInfo | null
  reset: () => void
  title: string
  message: string
  showDetails: boolean
}

interface DefaultFallbackUIState {
  detailsOpen: boolean
  copied: boolean
}

class DefaultFallbackUI extends Component<
  DefaultFallbackUIProps,
  DefaultFallbackUIState
> {
  constructor(props: DefaultFallbackUIProps) {
    super(props)
    this.state = { detailsOpen: false, copied: false }
  }

  private handleCopy = async () => {
    const { error, errorInfo } = this.props
    const content = [
      `Error: ${error?.name || 'Unknown'}`,
      `Message: ${error?.message || '—'}`,
      `Stack:`,
      error?.stack || '—',
      '',
      `Component Stack:`,
      errorInfo?.componentStack || '—',
    ].join('\n')

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(content)
        this.setState({ copied: true })
        window.setTimeout(() => {
          this.setState({ copied: false })
        }, 2000)
      }
    } catch {
      // silencieux
    }
  }

  private handleToggleDetails = () => {
    this.setState((previous) => ({
      detailsOpen: !previous.detailsOpen,
    }))
  }

  render() {
    const { error, errorInfo, reset, title, message, showDetails } = this.props
    const { detailsOpen, copied } = this.state

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[50vh] items-center justify-center bg-canvas p-4 sm:min-h-[60vh] sm:p-6"
      >
        <div className="w-full max-w-lg">
          <div
            className={cn(
              'rounded-card border border-danger/20 bg-surface p-6 shadow-card sm:p-8',
              'text-center'
            )}
          >
            {/* ────────────────────────────────────────────────── */}
            {/*  ICON                                              */}
            {/* ────────────────────────────────────────────────── */}
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-danger/20 bg-danger-soft sm:h-20 sm:w-20">
              <AlertTriangle
                size={32}
                className="text-danger sm:h-10 sm:w-10"
                aria-hidden="true"
              />
            </div>

            {/* ────────────────────────────────────────────────── */}
            {/*  TITLE                                             */}
            {/* ────────────────────────────────────────────────── */}
            <h1 className="mb-2 text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl">
              {title}
            </h1>

            {/* ────────────────────────────────────────────────── */}
            {/*  MESSAGE                                           */}
            {/* ────────────────────────────────────────────────── */}
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-fg-muted sm:text-base">
              {message}
            </p>

            {/* ────────────────────────────────────────────────── */}
            {/*  DEV ERROR SUMMARY                                 */}
            {/* ────────────────────────────────────────────────── */}
            {showDetails && error ? (
              <div className="mb-6 rounded-xl border border-line bg-muted/50 p-3 text-left">
                <div className="mb-1 flex items-center gap-2">
                  <Bug
                    size={14}
                    className="text-danger"
                    aria-hidden="true"
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-danger">
                    {error.name || 'Error'}
                  </p>
                </div>

                <p className="break-words text-xs font-medium text-fg sm:text-sm">
                  {error.message || 'Erreur inconnue'}
                </p>
              </div>
            ) : null}

            {/* ────────────────────────────────────────────────── */}
            {/*  ACTIONS                                           */}
            {/* ────────────────────────────────────────────────── */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-pill',
                  'border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg shadow-card',
                  'transition-colors duration-200',
                  'hover:border-accent/30 hover:bg-accent-soft hover:text-accent',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
              >
                <Home size={16} aria-hidden="true" />
                Accueil
              </Link>

              <button
                type="button"
                onClick={reset}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-pill',
                  'bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-card',
                  'transition-colors duration-200',
                  'hover:bg-accent-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
                )}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Rafraîchir la page
              </button>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────── */}
          {/*  DETAILS (dev only)                                  */}
          {/* ──────────────────────────────────────────────────── */}
          {showDetails && (error || errorInfo) ? (
            <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <button
                type="button"
                onClick={this.handleToggleDetails}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-4 py-3 text-left',
                  'text-sm font-medium text-fg transition-colors',
                  'hover:bg-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'
                )}
                aria-expanded={detailsOpen}
              >
                <span className="flex items-center gap-2">
                  <Bug size={14} className="text-fg-subtle" aria-hidden="true" />
                  Détails techniques
                </span>

                {detailsOpen ? (
                  <ChevronUp size={16} aria-hidden="true" />
                ) : (
                  <ChevronDown size={16} aria-hidden="true" />
                )}
              </button>

              {detailsOpen ? (
                <div className="border-t border-line p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      Stack trace
                    </p>

                    <button
                      type="button"
                      onClick={this.handleCopy}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[10px] font-semibold',
                        'border border-line bg-muted text-fg-muted',
                        'transition-colors duration-200',
                        'hover:bg-accent-soft hover:text-accent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      )}
                    >
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>

                  {error?.stack ? (
                    <pre
                      dir="ltr"
                      className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 text-left text-[11px] leading-relaxed text-fg-muted"
                    >
                      <code>{error.stack}</code>
                    </pre>
                  ) : null}

                  {errorInfo?.componentStack ? (
                    <>
                      <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Component stack
                      </p>

                      <pre
                        dir="ltr"
                        className="max-h-48 overflow-auto rounded-lg bg-muted/60 p-3 text-left text-[11px] leading-relaxed text-fg-muted"
                      >
                        <code>{errorInfo.componentStack}</code>
                      </pre>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ──────────────────────────────────────────────────── */}
          {/*  SUPPORT LINK                                        */}
          {/* ──────────────────────────────────────────────────── */}
          <p className="mt-4 text-center text-xs text-fg-subtle">
            Le problème persiste ?{' '}
            <Link
              href="/support"
              className="font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Contactez le support
            </Link>
          </p>
        </div>
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ERROR BOUNDARY                                                 */
/* ═══════════════════════════════════════════════════════════════ */

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught an error:', error, errorInfo)

    this.setState({ errorInfo })

    try {
      this.props.onError?.(error, errorInfo)
    } catch (callbackError) {
      // eslint-disable-next-line no-console
      console.error(
        '[ErrorBoundary] onError callback failed:',
        callbackError
      )
    }
  }

  componentDidUpdate(
    previousProps: ErrorBoundaryProps,
    previousState: ErrorBoundaryState
  ): void {
    const { hasError } = this.state
    const { resetKeys } = this.props

    if (
      hasError &&
      previousState.hasError &&
      !arraysEqual(previousProps.resetKeys, resetKeys)
    ) {
      this.reset()
    }
  }

  private reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })

    try {
      this.props.onReset?.()
    } catch (resetError) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] onReset callback failed:', resetError)
    }
  }

  render(): ReactNode {
    const { children, fallback, className, showDetails, title, message } =
      this.props

    const { hasError, error, errorInfo } = this.state

    if (!hasError || !error) {
      return children
    }

    const fallbackProps: ErrorBoundaryFallbackProps = {
      error,
      errorInfo,
      reset: this.reset,
      title,
      message,
      showDetails: showDetails ?? IS_DEV,
    }

    if (typeof fallback === 'function') {
      return (
        <div className={className} data-error-boundary="custom">
          {fallback(fallbackProps)}
        </div>
      )
    }

    if (fallback) {
      return (
        <div className={className} data-error-boundary="custom">
          {fallback}
        </div>
      )
    }

    return (
      <div className={className} data-error-boundary="default">
        <DefaultFallback {...fallbackProps} />
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOC : withErrorBoundary                                        */
/* ═══════════════════════════════════════════════════════════════ */

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps: Omit<ErrorBoundaryProps, 'children'> = {}
) {
  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }

  const wrappedName =
    WrappedComponent.displayName || WrappedComponent.name || 'Component'

  WithErrorBoundary.displayName = `withErrorBoundary(${wrappedName})`

  return WithErrorBoundary
}

export default ErrorBoundary