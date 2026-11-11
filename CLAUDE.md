# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gercie is a high-end e-commerce marketplace built with **Next.js 16 (App Router)**, React, Supabase (PostgreSQL + Auth), and Tailwind CSS v4. It's a full-stack application supporting three user roles: Acheteur (buyer), Vendeur (seller), and Livreur (courier). Key features include escrow payments, real-time delivery tracking, admin panel management, an AI chatbot/recommendations system, PWA support, and internationalization (French, English, Arabic).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run format` | Run Prettier |
| `npm run format:check` | Check Prettier formatting |
| `npm run type-check` | TypeScript type checking (`tsc --noEmit`) |
| `npm test` | Run Jest unit tests |
| `npm run test:watch` | Watch Jest mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run storybook` | Start Storybook dev server |
| `npm run seed` | Seed database |
| `npm run generate-embeddings` | Generate AI embeddings |

**Single file / single test:** Run jest on specific files: `npx jest <file-path>` or configure in `jest.config.ts`.

## Architecture (Key Directories)

```
├── app/                       # Next.js App Router - routes & pages
│   ├── [locale]/             # Internationalized routes (FR, EN, AR)
│   │   └── pages/ or app dirs for each locale group
│   ├── api/                   # Route handlers (API endpoints)
│   ├── admin/                 # Admin panel pages & API routes
│   │   └── .../[id]/modifier/  # Individual product edit page
│   ├── dashboard/             # Vendor dashboard (livreur stats, historique)
│   ├── auth/                  # Register, login, forgot-password pages
│   ├── produits/              # Product catalog [id] pages
│   ├── panier/                # Shopping cart
│   ├── commande/             # Order confirmation, payment flow
│   └── ...                    # Many feature directories
│
├── components/                # Shared React components
├── contexts/                  # React Context providers (auth, cart, etc.)
├── hooks/                     # Custom React hooks
├── lib/                       # Core library code
│   ├── services/              # Business logic layer for API routes
│   ├── utils/                 # General utilities
│   ├── validations/           # Zod validation schemas
│   ├── validators/            # Extra validators
│   ├── ai/                    # AI integration (OpenAI embeddings, chatbot)
│   ├── auth/                  # Supabase auth helpers
│   ├── payment/               # Stripe escrow, wallet
│   ├── email/                 # Resend emails
│   ├── search/                # Meilisearch integration
│   ├── types/                 # TypeScript domain types
│   ├── cart/                  # Cart management
│   ├── queue/                 # BullMQ async jobs (ai-embeddings)
│   └── monitoring/            # Sentry error reporting
│
├── supabase/                  # PostgreSQL schema SQL files (migration scripts)
├── prisma? / node_modules/@prisma → Prisma schema define data models
├── features/                  # Feature-specific shared utilities
├── hooks/                     # (duplicate of root hooks; likely symlinked)
├── messages/                  # i18n translation files
├── stories/                   # Storybook stories
├── tests/                     # Jest test setup files
├── __tests__/                 # Jest test setup
├── cypress/                   # Cypress E2E tests
├── e2e/                       # Playwright E2E tests (.spec.ts files)
├── docs/                      # Documentation
├── scripts/                  # Build/seed scripts
└── public/                    # Static assets
```

### Key Architecture Patterns

- **API Routes** delegate business logic to `lib/services/` functions — keep service code there, not in route handlers.
- **Internationalization** uses `next-intl` (configured in `next.config.mjs` via the `withNextIntl` plugin). Routes live under `app/[locale]/...`. The middleware (`middleware.ts`) handles cookie-based session guard protection, onboarding checks, and security headers.
- **Authentication** uses Supabase (Auth + RLS policies in Postgres). The middleware sets a `gercie_guard` cookie to protect sensitive paths.
- **Testing**: unit tests use Jest/Vitest component testing library (`@testing-library/react`, `@testing-library/jest-dom`); E2E tests use Playwright across multiple browser profiles and themes.
- **Tailwind CSS v4** is used via `@tailwindcss/postcss`.
- **TypeScript** project references are set up with path aliases `@/*`, `@components/*`, `@lib/*`, `@hooks/*`, `@contexts/*`.
- The first-party domain error pages are custom-built in `errors.html`/`errors.json`/`errors.txt`.
