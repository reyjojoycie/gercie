// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import path from 'path'

/**
 * Configuration Playwright ultra‑premium pour Gercie.
 *
 * Utilise les projets multi‑navigateurs, le parallélisme, le serveur web Next.js,
 * les timeouts étendus, les reporters multiples (HTML, JSON, JUnit),
 * les fixtures automatiques (auth, panier pré‑rempli), et la gestion des thèmes.
 */
export default defineConfig({
  // Répertoire des tests
  testDir: './e2e',

  // Pattern de fichiers de test
  testMatch: '**/*.spec.ts',

  // Dossier des snapshots (captures d'écran)
  snapshotDir: './e2e/snapshots',

  // Timeout global par test
  timeout: 60_000,

  // Nombre de tentatives en cas d'échec (CI uniquement)
  retries: process.env.CI ? 2 : 0,

  // Nombre de workers parallèles
  workers: process.env.CI ? 3 : 1,

  // Reporter : HTML pour l'interface, JSON pour CI, JUnit pour intégration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // Répertoire de sortie pour les résultats
  outputDir: 'test-results',

  // Configuration globale
  use: {
    // URL de base de l'application
    baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

    // Traces en cas d'échec uniquement
    trace: 'retain-on-failure',

    // Capture d'écran automatique en cas d'échec
    screenshot: 'only-on-failure',

    // Vidéo en cas d'échec
    video: 'retain-on-failure',

    // Timeout des actions (clic, saisie)
    actionTimeout: 15_000,

    // Permissions de navigateur (géolocalisation, notifications)
    permissions: ['geolocation'],

    // Géolocalisation simulée (Kinshasa)
    geolocation: { latitude: -4.4419, longitude: 15.2663 },

    // Langue et fuseau horaire
    locale: 'fr-CD',
    timezoneId: 'Africa/Kinshasa',

    // Viewport par défaut
    viewport: { width: 1280, height: 720 },

    // Désactiver le cache du navigateur
    bypassCSP: true,

    // Accepter les dialogues
    acceptDownloads: true,
  },

  // Projets (configurations de navigateurs et d'appareils)
  projects: [
    // ── Desktop ──
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
    },

    // ── Mobile ──
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'iphone-14',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'galaxy-s23',
      use: {
        ...devices['Galaxy S23'],
        // Override locale pour mobile si nécessaire
        locale: 'fr-CD',
      },
    },

    // ── Tablette ──
    {
      name: 'ipad-pro-11',
      use: { ...devices['iPad Pro 11'] },
    },

    // ── Thèmes (exécutions séparées pour light/dark) ──
    {
      name: 'chromium-dark',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        // Stockage local pour activer le thème sombre
        storageState: {
          cookies: [],
          origins: [
            {
              origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
              localStorage: [{ name: 'gercie-theme', value: 'dark' }],
            },
          ],
        },
      },
    },
    {
      name: 'chromium-reduced-motion',
      use: {
        ...devices['Desktop Chrome'],
        reducedMotion: 'reduce',
      },
    },
  ],

  // Serveur web (Next.js)
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    cwd: process.cwd(),
  },

  // Variables d'environnement globales pour les tests
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'e2e', 'global-teardown.ts'),
})