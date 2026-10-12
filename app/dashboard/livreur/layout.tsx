// app/dashboard/livreur/layout.tsx
'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'
import Link from 'next/link'

export default function LivreurLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [isLivreur, setIsLivreur] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) {
      setIsLivreur(false)
      return
    }

    const checkLivreur = async () => {
      // Vérification via la colonne 'id' de la table 'livreurs'
      const { data, error } = await supabaseBrowser
        .from('livreurs')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!error && data) {
        setIsLivreur(true)
      } else {
        // Fallback : colonne 'user_id'
        const { data: data2, error: error2 } = await supabaseBrowser
          .from('livreurs')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()

        setIsLivreur(!!data2 && !error2)
      }
    }

    checkLivreur()
  }, [user])

  if (authLoading || isLivreur === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="xl" />
      </div>
    )
  }

  // Si pas livreur (ou pas connecté) → message d'accès refusé, pas de redirection
  if (!isLivreur) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="text-center space-y-4 p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Accès refusé</h1>
          <p className="text-neutral-600 dark:text-neutral-300">Vous n’avez pas les droits nécessaires pour accéder à cette page.</p>
          <Link href="/" className="inline-block mt-4 px-4 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition">Retour à l’accueil</Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}