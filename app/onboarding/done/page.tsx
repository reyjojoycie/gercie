'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'
import DoneStep from '../steps/DoneStep'

export default function DonePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!user) {
      router.replace('/login')
      return
    }

    supabaseBrowser
      .from('profiles')
      .select('terms_accepted_at, preferences')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        console.log('[DonePage] Vérification:', data)
        // ✅ Accepter si terms_accepted_at existe OU si preferences existe
        // (pour éviter la boucle si terms_accepted_at n'a pas été sauvegardé)
        if (data?.terms_accepted_at || data?.preferences) {
          setChecking(false)
        } else {
          router.replace('/onboarding/terms')
        }
      })
      .catch(() => {
        router.replace('/onboarding/terms')
      })
  }, [user, router])

  if (checking) return <Spinner size="lg" variant="premium" label="Vérification..." />

  return <DoneStep />
}