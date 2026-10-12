'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary spécifique pour les sections de la page d'accueil
 * Permet de ne pas casser toute la page si une section échoue
 */
export default class HomeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erreur dans une section de la page d\'accueil:', error, errorInfo);
    
    // Log vers un service de monitoring (Sentry, etc.)
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="w-full py-12 px-4 text-center bg-neutral-50 dark:bg-neutral-900 border-y border-border"
          role="alert"
        >
          <AlertTriangle
            className="mx-auto text-warning mb-4"
            size={32}
            aria-hidden="true"
          />
          <h3 className="text-lg font-semibold mb-2">
            Oups, quelque chose s'est mal passé
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            Une erreur est survenue dans cette section. Vous pouvez continuer à
            naviguer sur le site.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Réessayer
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}