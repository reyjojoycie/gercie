// app/Providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/components/ui/Toast'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { OnlineStatusProvider } from '@/contexts/OnlineStatusContext'
import { LoyaltyProvider } from '@/contexts/LoyaltyProvider'
import { AnnouncerProvider } from '@/contexts/AnnouncerContext'
import { ReactNode, useState, memo } from 'react'

/* ------------------------------------------------------------------ */
/*  Helper : composeProviders pour éviter le "Provider Hell"           */
/* ------------------------------------------------------------------ */
function composeProviders(...providers: React.FC<{ children: ReactNode }>[]) {
  return ({ children }: { children: ReactNode }) => {
    return providers.reduceRight(
      (acc, Provider) => <Provider>{acc}</Provider>,
      <>{children}</>
    )
  }
}

/* ------------------------------------------------------------------ */
/*  Configuration QueryClient optimisée pour Kinshasa                  */
/* ------------------------------------------------------------------ */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes (augmenté pour réseaux lents)
        gcTime: 30 * 60 * 1000, // 30 minutes de cache mémoire
        retry: 3, // Plus de retries pour réseaux instables
        retryDelay: (attemptIndex) => {
          // Backoff exponentiel : 1s, 2s, 4s (max 8s)
          return Math.min(1000 * Math.pow(2, attemptIndex), 8000)
        },
        refetchOnWindowFocus: false, // Pas de refetch au focus (économise data)
        refetchOnReconnect: true,
        refetchOnMount: true,
        suspense: false,
        // Important : permettre les requêtes même hors-ligne (cache)
        networkMode: 'offlineFirst',
      },
      mutations: {
        retry: 1,
        retryDelay: 1000,
        networkMode: 'online', // Mutations seulement en ligne
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Composition des providers (ordre optimisé)                         */
/* ------------------------------------------------------------------ */
const ComposedProviders = composeProviders(
  ThemeProvider,           // 1. Thème (pas de dépendance)
  OnlineStatusProvider,    // 2. Statut réseau (utilisé par les autres)
  AuthProvider,            // 3. Auth (fondamental)
  ToastProvider,           // 4. Toast (pour feedback)
  AnnouncerProvider,       // 5. Accessibilité (ARIA live)
  SearchProvider,          // 6. Recherche globale
  CartProvider,            // 7. Panier (dépend de Auth)
  FavoritesProvider,       // 8. Favoris (dépend de Auth)
  LoyaltyProvider          // 9. Fidélité (dépend de Auth + Cart)
)

/* ------------------------------------------------------------------ */
/*  Composant Providers principal                                      */
/* ------------------------------------------------------------------ */
export default function Providers({ children }: { children: ReactNode }) {
  // QueryClient créé une seule fois par instance (évite partage SSR)
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ComposedProviders>
        {children}
      </ComposedProviders>

      {/* DevTools uniquement en développement */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      )}
    </QueryClientProvider>
  )
}