// components/ui/ErrorBoundary.tsx
'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    // TODO: Envoyer à Sentry/Logtail
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Une erreur est survenue
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              {process.env.NODE_ENV === 'development'
                ? this.state.error?.message
                : 'Veuillez rafraîchir la page ou réessayer plus tard.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Rafraîchir la page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}