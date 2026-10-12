'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'
import TermsStep from '../steps/TermsStep'

export default function TermsPage() {
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
      .select('preferences')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        // ✅ CORRECTION : vérifier langue ET devise (pas categories)
        const prefs = data?.preferences as any
        if (prefs?.langue && prefs?.devise) {
          setChecking(false)
        } else {
          router.replace('/onboarding/preferences')
        }
      })
      .catch(() => {
        router.replace('/onboarding/preferences')
      })
  }, [user, router])

  if (checking) return <Spinner size="lg" variant="premium" label="Vérification..." />

  return <TermsStep />
}