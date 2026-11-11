// app/dashboard/livreur/layout.tsx
'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFIG                                                         */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Si tu veux permettre à un administrateur d'ouvrir l'espace livreur
 * pour tester, passe cette valeur à true.
 *
 * Par défaut : false, donc seul un vrai livreur peut accéder.
 */
const ALLOW_ADMIN_BYPASS = false

const DEFAULT_REDIRECT = '/dashboard/livreur'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type AccessStatus =
  | 'loading'
  | 'authorized'
  | 'forbidden'
  | 'unauthenticated'
  | 'error'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getLoginUrl(pathname?: string | null): string {
  const redirect = pathname || DEFAULT_REDIRECT
  return `/login?redirect=${encodeURIComponent(redirect)}`
}

function normalizeRole(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function hasRole(values: unknown[], expected: string): boolean {
  return values.some((value) => normalizeRole(value) === expected)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LAYOUT                                                         */
/* ═══════════════════════════════════════════════════════════════ */

export default function LivreurDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)
  const isAdmin = Boolean(auth?.isAdmin)

  const [status, setStatus] = useState<AccessStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Titre de page                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Espace livreur | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Vérification d'accès                                        */
  /* ---------------------------------------------------------- */

  const verifyAccess = useCallback(async (): Promise<AccessStatus> => {
    if (!user) {
      return 'unauthenticated'
    }

    const sb = supabaseBrowser as any

    /* -------------------------------------------------------- */
    /* 1. Vérification rapide via metadata Auth                  */
    /* -------------------------------------------------------- */

    const metadataRoles = [
      user?.user_metadata?.role,
      user?.user_metadata?.type_user,
      user?.app_metadata?.role,
      user?.app_metadata?.type_user,
      user?.role,
    ].filter(Boolean)

    if (hasRole(metadataRoles, 'livreur')) {
      return 'authorized'
    }

    if (
      ALLOW_ADMIN_BYPASS &&
      (isAdmin ||
        hasRole(metadataRoles, 'admin') ||
        hasRole(metadataRoles, 'super_admin'))
    ) {
      return 'authorized'
    }

    /* -------------------------------------------------------- */
    /* 2. Vérification via profiles                              */
    /* -------------------------------------------------------- */

    try {
      const { data: profile } = await sb
        .from('profiles')
        .select('id, type_user, role, is_admin')
        .eq('id', user.id)
        .maybeSingle()

      const profileRoles = [
        profile?.type_user,
        profile?.role,
      ].filter(Boolean)

      if (hasRole(profileRoles, 'livreur')) {
        return 'authorized'
      }

      if (
        ALLOW_ADMIN_BYPASS &&
        (profile?.is_admin === true ||
          hasRole(profileRoles, 'admin') ||
          hasRole(profileRoles, 'super_admin'))
      ) {
        return 'authorized'
      }
    } catch {
      // On continue : si profiles n'est pas lisible, on teste livreurs.
    }

    /* -------------------------------------------------------- */
    /* 3. Vérification via livreurs.id = user.id                 */
    /* -------------------------------------------------------- */

    try {
      const { data: livreurById } = await sb
        .from('livreurs')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (livreurById) {
        return 'authorized'
      }
    } catch {
      // Colonne/table absente ou erreur RLS : on continue.
    }

    /* -------------------------------------------------------- */
    /* 4. Vérification via livreurs.user_id = user.id            */
    /* -------------------------------------------------------- */

    try {
      const { data: livreurByUserId } = await sb
        .from('livreurs')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (livreurByUserId) {
        return 'authorized'
      }
    } catch {
      // Colonne/table absente ou erreur RLS : on continue.
    }

    /* -------------------------------------------------------- */
    /* Accès refusé                                              */
    /* -------------------------------------------------------- */

    return 'forbidden'
  }, [isAdmin, user])

  /* ---------------------------------------------------------- */
  /* Effet principal                                             */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    let cancelled = false

    setStatus('loading')
    setErrorMessage(null)

    verifyAccess()
      .then((nextStatus) => {
        if (!cancelled) {
          setStatus(nextStatus)
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(
            err?.message ||
              'Impossible de vérifier ton accès à l’espace livreur.'
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, verifyAccess])

  /* ---------------------------------------------------------- */
  /* Retry                                                       */
  /* ---------------------------------------------------------- */

  const handleRetry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)

    verifyAccess()
      .then((nextStatus) => {
        setStatus(nextStatus)
      })
      .catch((err: any) => {
        setStatus('error')
        setErrorMessage(
          err?.message ||
            'Impossible de vérifier ton accès à l’espace livreur.'
        )
      })
  }, [verifyAccess])

  /* ---------------------------------------------------------- */
  /* Rendu loading                                               */
  /* ---------------------------------------------------------- */

  if (authLoading || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="xl" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Vérification de l’accès livreur...
          </p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu non connecté                                          */
  /* ---------------------------------------------------------- */

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <div className="w-full max-w-md space-y-5 rounded-3xl border border-gold-400/20 bg-white p-8 text-center shadow-soft dark:border-gold-400/20 dark:bg-midnight-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10 text-2xl font-bold text-gold-600 dark:text-gold-400">
            🔐
          </div>

          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Connexion requise
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Tu dois être connecté pour accéder à ton espace livreur.
            </p>
          </div>

          <Link
            href={getLoginUrl(pathname)}
            className="inline-flex items-center justify-center rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-gold transition hover:bg-gold-600"
          >
            Se connecter
          </Link>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu accès refusé                                          */
  /* ---------------------------------------------------------- */

  if (status === 'forbidden') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <div className="w-full max-w-md space-y-5 rounded-3xl border border-red-200 bg-white p-8 text-center shadow-soft dark:border-red-900/40 dark:bg-midnight-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-2xl font-bold text-red-600 dark:text-red-400">
            ⛔
          </div>

          <div>
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-300">
              Accès refusé
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Cet espace est réservé aux livreurs validés par Gercie.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-gold transition hover:bg-gold-600"
          >
            Retour à l’accueil
          </Link>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <div className="w-full max-w-md space-y-5 rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-soft dark:border-amber-900/40 dark:bg-midnight-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl font-bold text-amber-600 dark:text-amber-400">
            ⚠️
          </div>

          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Vérification impossible
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {errorMessage ||
                'Une erreur est survenue pendant la vérification de ton accès.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white shadow-gold transition hover:bg-gold-600"
            >
              Réessayer
            </button>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-midnight-800 dark:text-neutral-200 dark:hover:bg-midnight-700"
            >
              Retour à l’accueil
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Accès autorisé                                              */
  /* ---------------------------------------------------------- */

  return <>{children}</>
}