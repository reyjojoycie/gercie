// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({
  // Chemin vers l'application Next.js
  dir: './',
})

const customJestConfig: Config = {
  // Ajoute un commentaire pour expliquer la configuration
  // Utilise le préfixe @ pour les aliases de tsconfig
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@lib/(.*)$': '<rootDir>/lib/$1',
    '^@hooks/(.*)$': '<rootDir>/hooks/$1',
    '^@contexts/(.*)$': '<rootDir>/contexts/$1',
  },
  // Environnement de test pour simuler le navigateur
  testEnvironment: 'jsdom',
  // Fichiers à considérer comme modules
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  // Transformations
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  // Ignore les node_modules sauf certains qui utilisent ESM
  transformIgnorePatterns: [
    '/node_modules/(?!(lucide-react|@supabase/ssr)/)',
  ],
  // Dossier de sortie de la couverture
  collectCoverage: false,
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
}

export default createJestConfig(customJestConfig)