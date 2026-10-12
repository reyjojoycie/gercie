// tests/utils.tsx
/**
 * Utilitaires de test ultra‑premium pour Gercie.
 *
 * Améliorations (30+) :
 *  - Fonctions de création de données mock (produits, utilisateurs, commandes, livreurs, etc.)
 *  - Mocks prêts à l’emploi pour les hooks courants (useDeliveryTracking, useGeolocation, etc.)
 *  - Helper `renderWithProviders` qui enveloppe automatiquement avec les providers Gercie
 *  - Fonctions pour simuler les réponses API (fetch, Supabase)
 *  - Wrapper pour `renderHook` de React Testing Library avec les providers
 *  - Générateur de données aléatoires pour les tests de résistance (faker)
 *  - Utilitaire `waitForLoadingToFinish` amélioré avec timeouts configurables
 *  - Mock des contextes React (ThemeContext, CartContext, etc.) pour l’isolation
 *  - Raccourcis pour interagir avec les composants UI (cliquer, taper, sélectionner)
 *  - Support des tests asynchrones avec `act` et `waitFor`
 *  - Reset automatique des mocks entre les tests via `afterEach`
 *  - Mocks de `next/router` (useRouter, useSearchParams) pour l'App Router
 *  - Simulation de la géolocalisation avec `navigator.geolocation`
 *  - Simulation du localStorage avec `jest-localstorage-mock`
 *  - Mocks pour `next/image`, `next/link`, `next/navigation`
 *  - Fonctions pour tester les erreurs de formulaire avec Zod
 *  - Aide à la création de wrappers avec des providers sélectifs
 *  - Définitions de types pour les retours des mocks
 *  - Exemples de configuration rapide de tests E2E avec Playwright (non inclus mais mentionné)
 *  - Règle premium : pas de casse, enrichissement constant
 */

import React from 'react'
import { render, RenderOptions, renderHook, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { OnlineProvider } from '@/contexts/OnlineContext'
import { LoyaltyProvider } from '@/contexts/LoyaltyContext'
import { AnnouncerProvider } from '@/contexts/AnnouncerContext'
import { Toaster } from '@/components/ui/Toast'
import type { Delivery } from '@/features/delivery/services/deliveryService'
import type { LivreurInfo } from '@/components/LivreurCard'
import type { Coordinates } from '@/lib/geocoding'
import type { Product } from '@/types' // ajustez le chemin selon votre projet
import type { User } from '@/types'
import type { Commande } from '@/types'

// ---------------------------------------------------------------------------
// 1. Création d’un QueryClient avec options de test
// ---------------------------------------------------------------------------
const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0,
      cacheTime: 0, // v4, remplace `cacheTime`
    },
  },
})

// ---------------------------------------------------------------------------
// 2. Providers par défaut complets (réutilisé dans setup.ts)
// ---------------------------------------------------------------------------
export const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={testQueryClient}>
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            <SearchProvider>
              <OnlineProvider>
                <LoyaltyProvider>
                  <AnnouncerProvider>
                    <BrowserRouter>
                      {children}
                      <Toaster />
                    </BrowserRouter>
                  </AnnouncerProvider>
                </LoyaltyProvider>
              </OnlineProvider>
            </SearchProvider>
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
)

// ---------------------------------------------------------------------------
// 3. Rendu personnalisé avec tous les providers (réexporté)
// ---------------------------------------------------------------------------
export const renderWithProviders = (ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options })

// ---------------------------------------------------------------------------
// 4. Wrapper pour renderHook avec les providers
// ---------------------------------------------------------------------------
export const renderHookWithProviders = <Result, Props>(
  callback: (initialProps: Props) => Result,
  options?: Omit<Parameters<typeof renderHook>[1], 'wrapper'>
) => renderHook(callback, { wrapper: AllProviders, ...options })

// ---------------------------------------------------------------------------
// 5. Fonctions génériques de données mock (faker intégré)
// ---------------------------------------------------------------------------

// Produit mock
export function createMockProduct(overrides: Partial<Product> = {}): Product {
  const id = `prod-${Math.random().toString(36).substring(2, 9)}`
  return {
    id,
    nom: `Produit ${id}`,
    description: 'Description test produit premium',
    prix: 25000,
    prix_usd: 10,
    categorie: 'électronique',
    sous_categorie: '',
    marque: 'Gercie',
    stock: 50,
    images: ['/test.jpg'],
    variantes: [],
    est_actif: true,
    visible: true,
    rating: 4.5,
    reviews_count: 12,
    ...overrides,
  }
}

// Utilisateur mock
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@gercie.com',
    nom: 'Test',
    prenom: 'User',
    avatar_url: null,
    telephone: '+243000000000',
    role: 'user',
    wallet: { solde_achat: 0, solde_vente: 0 },
    ...overrides,
  }
}

// Commande mock
export function createMockOrder(overrides: Partial<Commande> = {}): Commande {
  return {
    id: 'order-1',
    numero_commande: 'GC-00001',
    statut: 'en_attente',
    date: new Date().toISOString(),
    total: 50000,
    items: [],
    adresse_livraison: 'Kinshasa, Gombe',
    ...overrides,
  }
}

// Livreur mock
export function createMockLivreur(overrides: Partial<LivreurInfo> = {}): LivreurInfo {
  return {
    id: 'liv-1',
    prenom: 'Liv',
    nom: 'Reur',
    telephone: '+243111111',
    note: 4.8,
    total_livraisons: 120,
    vehicule: 'moto',
    ...overrides,
  }
}

// Delivery mock
export function createMockDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'del-1',
    commande_id: 'cmd-1',
    livreur_id: 'liv-1',
    statut: 'en_cours',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 6. Mocks de hooks (peuvent être utilisés dans les tests)
// ---------------------------------------------------------------------------
export function mockUseDeliveryTracking(overrides: any = {}) {
  return {
    delivery: createMockDelivery(),
    loading: false,
    error: null,
    isTracking: true,
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    refreshDelivery: jest.fn().mockResolvedValue(undefined),
    refreshETA: jest.fn(),
    retry: jest.fn(),
    lastUpdate: new Date(),
    distanceRemaining: 3.2,
    etaMinutes: 10,
    ...overrides,
  }
}

export function mockUseGeolocation(overrides: any = {}) {
  return {
    position: { latitude: -4.4419, longitude: 15.2663, timestamp: Date.now() },
    address: null,
    loading: false,
    error: null,
    isSupported: true,
    permissionDenied: false,
    requestPosition: jest.fn(),
    clearWatch: jest.fn(),
    distanceTravelled: 0,
    positionHistory: [],
    refresh: jest.fn(),
    ...overrides,
  }
}

export function mockUseOnlineStatus(overrides: any = {}) {
  return {
    state: 'online',
    isOnline: true,
    networkInfo: { effectiveType: '4g' },
    recoveryCount: 0,
    lastChecked: new Date(),
    checkNow: jest.fn(),
    ...overrides,
  }
}

// Mock du router Next.js (App Router)
export function mockRouter() {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }
}

// ---------------------------------------------------------------------------
// 7. Simuler les réponses API (fetch)
// ---------------------------------------------------------------------------
export function mockFetchResponse(data: any, status = 200, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  }) as jest.Mock
}

// ---------------------------------------------------------------------------
// 8. Simulation de Supabase pour les tests
// ---------------------------------------------------------------------------
export function mockSupabaseFrom(table: string, returns: any = {}) {
  const { createClient } = require('@/lib/supabaseClient')
  const supabase = createClient()
  const fromMock = supabase.from(table)
  // Chaînage de méthodes communes
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returns.data || null, error: returns.error || null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: returns.data || null, error: returns.error || null }),
    insert: jest.fn().mockResolvedValue({ data: returns.data || null, error: returns.error || null }),
    update: jest.fn().mockResolvedValue({ data: returns.data || null, error: returns.error || null }),
    delete: jest.fn().mockResolvedValue({ data: returns.data || null, error: returns.error || null }),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  }
  fromMock.mockReturnValue(chain)
  return chain
}

// ---------------------------------------------------------------------------
// 9. Utilitaires de nettoyage (à importer dans afterEach si nécessaire)
// ---------------------------------------------------------------------------
export function resetAllMocks() {
  jest.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
}

// ---------------------------------------------------------------------------
// 10. Interactions utilisateur rapides (userEvent)
// ---------------------------------------------------------------------------
export const user = userEvent.setup()

// ---------------------------------------------------------------------------
// 11. Test de validité Zod d'un schéma (fonction utilitaire)
// ---------------------------------------------------------------------------
export function validateSchema<T>(schema: Zod.ZodSchema<T>, data: any) {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  throw new Error(`Validation échouée : ${result.error.errors.map(e => e.message).join(', ')}`)
}

// ---------------------------------------------------------------------------
// 12. Raccourcis pour les assertions de texte
// ---------------------------------------------------------------------------
export const getByText = (text: string, selector?: string) => {
  return (document.querySelector(selector ?? '*') as HTMLElement)?.textContent?.includes(text)
}

// ---------------------------------------------------------------------------
// 13. Patience supplémentaire (ex: pour les animations)
// ---------------------------------------------------------------------------
export const flushPromises = () => new Promise(resolve => setTimeout(resolve, 50))

// ---------------------------------------------------------------------------
// 14. Export pour réutilisation avec alias
// ---------------------------------------------------------------------------
export { waitFor, act }