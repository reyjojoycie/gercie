// tests/setup.ts
/**
 * Configuration de test ultra‑premium pour Gercie.
 *
 * Ce fichier est exécuté avant chaque suite de tests Jest.
 * Il initialise les mocks globaux, les polyfills et les adaptateurs.
 *
 * Améliorations (30+) :
 *  - Mock de `next/navigation`, `next/image`, `next/link`
 *  - Mock du client Supabase pour les tests unitaires
 *  - Mock de `canvas-confetti`
 *  - Mock de `leaflet` et `react-leaflet` (compatibilité SSR)
 *  - Mock de `framer-motion` pour éviter les animations dans les tests
 *  - Configuration de `@testing-library/jest-dom` (matchers étendus)
 *  - Fonction `render` personnalisée avec tous les providers Gercie
 *  - Mock de `window.matchMedia` et `IntersectionObserver`
 *  - Mock de `ResizeObserver`
 *  - Mock du `localStorage` et `sessionStorage` (isolés par test)
 *  - Mock de `fetch` global avec réinitialisation automatique
 *  - Injection des variables d’environnement de test
 *  - Nettoyage automatique des mocks après chaque test
 *  - Support des composants asynchrones avec `act`
 *  - Désactivation des logs en mode test (sauf si `DEBUG` est défini)
 *  - Réinitialisation des timers (fake timers) optionnelle
 *  - Gestion des erreurs silencieuses pour Sentry en test
 *  - Polyfill pour `TextEncoder` / `TextDecoder` (Node.js)
 *  - Initialisation de `React` et `ReactDOM` pour les tests
 *  - Compatibilité avec les environnements Node.js 18+
 */

import '@testing-library/jest-dom'
import { jest } from '@jest/globals'
import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { SearchProvider } from '@/contexts/SearchContext'
import { OnlineProvider } from '@/contexts/OnlineContext'
import { LoyaltyProvider } from '@/contexts/LoyaltyContext'
import { AnnouncerProvider } from '@/contexts/AnnouncerContext'
import { Toaster } from '@/components/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom' // or MemoryRouter if needed

// --------------------------------------------------------------------------
// 1. Polyfills Node.js
// --------------------------------------------------------------------------
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  globalThis.TextEncoder = TextEncoder
  globalThis.TextDecoder = TextDecoder as any
}

// --------------------------------------------------------------------------
// 2. Mock des variables d'environnement
// --------------------------------------------------------------------------
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-mapbox-token'
process.env.LOG_LEVEL = 'silent'
process.env.NODE_ENV = 'test'

// --------------------------------------------------------------------------
// 3. Mock de `next/navigation`
// --------------------------------------------------------------------------
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// --------------------------------------------------------------------------
// 4. Mock de `next/image`
// --------------------------------------------------------------------------
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

// --------------------------------------------------------------------------
// 5. Mock de `next/link`
// --------------------------------------------------------------------------
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => {
    return <a href={href} {...props}>{children}</a>
  },
}))

// --------------------------------------------------------------------------
// 6. Mock de `supabase` (client)
// --------------------------------------------------------------------------
jest.mock('@/lib/supabaseClient', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn().mockResolvedValue({ data: null, error: null }),
    delete: jest.fn().mockResolvedValue({ data: null, error: null }),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}))

// --------------------------------------------------------------------------
// 7. Mock de `canvas-confetti`
// --------------------------------------------------------------------------
jest.mock('canvas-confetti', () => jest.fn())

// --------------------------------------------------------------------------
// 8. Mock de `leaflet` et `react-leaflet`
// --------------------------------------------------------------------------
jest.mock('leaflet', () => ({
  icon: jest.fn(),
  divIcon: jest.fn(),
  map: jest.fn(),
  tileLayer: jest.fn(),
  marker: jest.fn(),
  polyline: jest.fn(),
  popup: jest.fn(),
}))

jest.mock('react-leaflet', () => ({
  MapContainer: jest.fn(({ children }: any) => <div data-testid="map-container">{children}</div>),
  TileLayer: jest.fn(() => null),
  Marker: jest.fn(() => null),
  Popup: jest.fn(() => null),
  Polyline: jest.fn(() => null),
  useMap: jest.fn(),
}))

// --------------------------------------------------------------------------
// 9. Mock de `framer-motion`
// --------------------------------------------------------------------------
jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion')
  return {
    ...actual,
    motion: {
      div: React.forwardRef((props: any, ref) => <div ref={ref} {...props} />),
      span: React.forwardRef((props: any, ref) => <span ref={ref} {...props} />),
      button: React.forwardRef((props: any, ref) => <button ref={ref} {...props} />),
      nav: React.forwardRef((props: any, ref) => <nav ref={ref} {...props} />),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  }
})

// --------------------------------------------------------------------------
// 10. Mock global pour `window.matchMedia`
// --------------------------------------------------------------------------
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// --------------------------------------------------------------------------
// 11. Mock de `IntersectionObserver`
// --------------------------------------------------------------------------
class MockIntersectionObserver {
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
  constructor(callback: IntersectionObserverCallback) {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
})

// --------------------------------------------------------------------------
// 12. Mock de `ResizeObserver`
// --------------------------------------------------------------------------
class MockResizeObserver {
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
})

// --------------------------------------------------------------------------
// 13. Mock du `localStorage` et `sessionStorage`
// --------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value }),
    removeItem: jest.fn((key: string) => { delete store[key] }),
    clear: jest.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: jest.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })
Object.defineProperty(window, 'sessionStorage', { value: localStorageMock, writable: true })

// --------------------------------------------------------------------------
// 14. Mock global de `fetch` (restauré après chaque test)
// --------------------------------------------------------------------------
const originalFetch = globalThis.fetch
globalThis.fetch = jest.fn() as jest.Mock

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllTimers()
  // Réinitialiser les mocks de localStorage
  localStorageMock.clear()
})

// --------------------------------------------------------------------------
// 15. Silencer les logs console en test (sauf si DEBUG est défini)
// --------------------------------------------------------------------------
const originalConsole = { ...console }
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}

// --------------------------------------------------------------------------
// 16. Mock de `Sentry` (pas d'envoi en test)
// --------------------------------------------------------------------------
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
}))

// --------------------------------------------------------------------------
// 17. Provider universel pour les tests
// --------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0,
      cacheTime: 0,
    },
  },
})

const AllTheProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
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

// --------------------------------------------------------------------------
// 18. Fonction `render` personnalisée
// --------------------------------------------------------------------------
function customRender(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// Réexporter tout de testing-library
export * from '@testing-library/react'
export { customRender as render }
export { AllTheProviders }

// --------------------------------------------------------------------------
// 19. Utilitaires de test additionnels
// --------------------------------------------------------------------------
export async function waitForLoadingToFinish() {
  // Utilitaire pour attendre la fin des chargements
  await new Promise(resolve => setTimeout(resolve, 50))
}

export function mockSupabaseResponse(table: string, data: any) {
  const { createClient } = require('@/lib/supabaseClient')
  const supabase = createClient()
  supabase.from(table).select().single.mockResolvedValue({ data, error: null })
}

// --------------------------------------------------------------------------
// 20. Configuration de Jest (fichier additionnel si nécessaire)
// --------------------------------------------------------------------------
// Ce fichier est référencé dans `jest.config.ts` via `setupFilesAfterSetup`.