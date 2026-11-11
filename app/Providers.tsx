// app/Providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'

import {
  useMemo,
  type ComponentType,
  type ReactNode,
} from 'react'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { OnlineStatusProvider } from '@/contexts/OnlineStatusContext'
import { AnnouncerProvider } from '@/contexts/AnnouncerContext'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { CartProvider } from '@/contexts/CartContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { LoyaltyProvider } from '@/contexts/LoyaltyProvider'

/* ------------------------------------------------------------------ */
/*  DEVTOOLS OPTIONNEL                                                 */
/*                                                                     */
/*  Si le paquet @tanstack/react-query-devtools est installé,          */
/*  tu peux décommenter l'import et le rendu plus bas.                 */
/*  Sinon, laisse commenté pour éviter une erreur de build.            */
/* ------------------------------------------------------------------ */

// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type ProviderComponent = ComponentType<{ children: ReactNode }>

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSE PROVIDERS                                                */
/*                                                                     */
/*  Évite le "provider hell" visuel tout en gardant un ordre clair.    */
/* ═══════════════════════════════════════════════════════════════ */

function composeProviders(...providers: ProviderComponent[]) {
  function ComposedProviders({ children }: { children: ReactNode }) {
    return providers.reduceRight<ReactNode>(
      (accumulator, Provider) => <Provider>{accumulator}</Provider>,
      children
    )
  }

  ComposedProviders.displayName = 'ComposedProviders'

  return ComposedProviders
}

/* ═══════════════════════════════════════════════════════════════ */
/*  QUERY CLIENT                                                     */
/*                                                                     */
/*  Optimisé pour :                                                    */
/*  - mobile                                                           */
/*  - réseaux lents / instables                                        */
/*  - cache local                                                      */
/*  - offline-first                                                    */
/*  - moins de refetchs inutiles                                       */
/* ═══════════════════════════════════════════════════════════════ */

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Données considérées fraîches 5 minutes.
        staleTime: 5 * 60 * 1000,

        // Garde les données en mémoire 30 minutes.
        gcTime: 30 * 60 * 1000,

        // Retry intelligent.
        retry: (failureCount, error) => {
          const anyError = error as {
            status?: number
            response?: { status?: number }
            cause?: { status?: number }
          }

          const status =
            anyError?.status ??
            anyError?.response?.status ??
            anyError?.cause?.status

          // Ne pas retry les erreurs client 4xx, sauf timeout / rate limit.
          if (typeof status === 'number') {
            if (status === 408 || status === 429) {
              return failureCount < 3
            }

            if (status >= 400 && status < 500) {
              return false
            }
          }

          return failureCount < 3
        },

        // Backoff exponentiel : 1s, 2s, 4s, maximum 8s.
        retryDelay: (attemptIndex) => {
          return Math.min(1000 * Math.pow(2, attemptIndex), 8000)
        },

        // Économie de données mobile.
        refetchOnWindowFocus: false,

        // Reprise quand la connexion revient.
        refetchOnReconnect: true,

        // Comportement standard au mount.
        refetchOnMount: true,

        // Autorise l'utilisation du cache même hors ligne.
        networkMode: 'offlineFirst',
      },

      mutations: {
        retry: 1,
        retryDelay: 1000,

        // Les mutations nécessitent normalement une connexion serveur.
        networkMode: 'online',
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Singleton côté navigateur                                          */
/*                                                                     */
/*  Évite plusieurs QueryClient en hot reload / dev.                   */
/*  En SSR, on crée un client par requête.                             */
/* ------------------------------------------------------------------ */

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    return createQueryClient()
  }

  if (!browserQueryClient) {
    browserQueryClient = createQueryClient()
  }

  return browserQueryClient
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ORDRE DES PROVIDERS                                              */
/*                                                                     */
/*  Ordre recommandé :                                                 */
/*                                                                     */
/*  1. ThemeProvider                                                   */
/*     -> tokens visuels, dark mode, préférences accessibilité         */
/*                                                                     */
/*  2. OnlineStatusProvider                                            */
/*     -> statut réseau, utilisé par offline / cache / badges          */
/*                                                                     */
/*  3. AnnouncerProvider                                               */
/*     -> ARIA live regions, accessibilité écran lecteur               */
/*                                                                     */
/*  4. ToastProvider                                                   */
/*     -> feedback visuel, peut être utilisé par Auth/Cart/etc.        */
/*                                                                     */
/*  5. AuthProvider                                                    */
/*     -> session utilisateur, dépend parfois de toast / online        */
/*                                                                     */
/*  6. SearchProvider                                                  */
/*     -> état de recherche globale, peut dépendre de auth             */
/*                                                                     */
/*  7. CartProvider                                                    */
/*     -> panier, dépend de auth / toast / online                      */
/*                                                                     */
/*  8. FavoritesProvider                                               */
/*     -> favoris, dépend de auth                                      */
/*                                                                     */
/*  9. LoyaltyProvider                                                 */
/*     -> fidélité / points, dépend de auth + cart                     */
/* ═══════════════════════════════════════════════════════════════ */

const AppProviders = composeProviders(
  ThemeProvider,
  OnlineStatusProvider,
  AnnouncerProvider,
  ToastProvider,
  AuthProvider,
  SearchProvider,
  CartProvider,
  FavoritesProvider,
  LoyaltyProvider
)

/* ═══════════════════════════════════════════════════════════════ */
/*  ROOT PROVIDERS COMPONENT                                         */
/* ═══════════════════════════════════════════════════════════════ */

export default function Providers({
  children,
}: {
  children: ReactNode
}) {
  const queryClient = useMemo(() => getQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        {/*
          MotionConfig respecte globalement la préférence système
          "réduire les animations".

          Cela complète useAccessibilityPreferences() et évite
          des animations framer-motion intrusives pour les utilisateurs
          sensibles au mouvement.
        */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </AppProviders>

      {/*
        Devtools React Query uniquement si le paquet est installé.

        Décommente si tu as bien installé :
        npm i -D @tanstack/react-query-devtools

        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-left"
          />
        )}
      */}
    </QueryClientProvider>
  )
}