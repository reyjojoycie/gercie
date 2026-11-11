// components/layout/AppShell.tsx
'use client'

import { Suspense, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import Navbar from '@/components/navbar/Navbar'
import Footer from '@/components/layout/Footer'

/* ═══════════════════════════════════════════════════════════════ */
/*  ROUTES SANS NAVBAR / FOOTER PUBLIC                             */
/* ═══════════════════════════════════════════════════════════════ */

const HIDE_PUBLIC_CHROME_PREFIXES = ['/admin']

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function normalizePathname(pathname: string | null | undefined): string {
  const raw = pathname ?? '/'

  if (raw.length > 1 && raw.endsWith('/')) {
    return raw.slice(0, -1)
  }

  return raw
}

function shouldHidePublicChrome(pathname: string): boolean {
  return HIDE_PUBLIC_CHROME_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOADING FALLBACK PREMIUM                                       */
/*                                                                 */
/*  Version autonome, sans dépendre d'un composant LoadingScreen   */
/*  qui pourrait ne pas encore exister dans le projet.             */
/* ═══════════════════════════════════════════════════════════════ */

function AppShellFallback({
  fullHeight = false,
}: {
  fullHeight?: boolean
}) {
  return (
    <div
      className={
        fullHeight
          ? 'relative isolate flex min-h-[100dvh] w-full flex-col items-center justify-center bg-canvas text-fg'
          : 'relative isolate flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center bg-canvas text-fg'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className={
            'h-10 w-10 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin motion-reduce:animate-pulse'
          }
          aria-hidden="true"
        />

        <p className="text-sm font-medium text-fg-muted">
          Chargement de la page…
        </p>
      </div>

      <span className="sr-only">Chargement en cours</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  APP SHELL                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function AppShell({
  children,
}: {
  children: ReactNode
}) {
  const pathname = normalizePathname(usePathname())

  const hidePublicChrome = shouldHidePublicChrome(pathname)

  /* ───────────────────────────────────────────────────────────── */
  /*  ZONES PRIVÉES / ADMIN                                        */
  /*                                                               */
  /*  Pas de navbar publique, pas de footer public.                */
  /*  La page gère elle-même son layout.                           */
  /* ───────────────────────────────────────────────────────────── */

  if (hidePublicChrome) {
    return (
      <Suspense fallback={<AppShellFallback fullHeight />}>
        <main
          id="main-content"
          tabIndex={-1}
          className="relative isolate flex min-h-[100dvh] w-full flex-col overflow-x-clip bg-canvas text-fg"
          data-app-shell="private"
        >
          {children}
        </main>
      </Suspense>
    )
  }

  /* ───────────────────────────────────────────────────────────── */
  /*  ZONES PUBLIQUES                                              */
  /*                                                               */
  /*  Navbar + contenu + footer.                                   */
  /*  Le main prend l’espace restant pour coller le footer en bas. */
  /* ───────────────────────────────────────────────────────────── */

  return (
    <>
      <Navbar />

      <Suspense fallback={<AppShellFallback />}>
        <main
          id="main-content"
          tabIndex={-1}
          className="relative isolate flex w-full min-h-[calc(100dvh-var(--header-height,4rem))] flex-1 flex-col overflow-x-clip bg-canvas text-fg"
          data-app-shell="public"
        >
          {children}
        </main>
      </Suspense>

      <Footer />
    </>
  )
}