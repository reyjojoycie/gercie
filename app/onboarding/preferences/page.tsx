// app/onboarding/preferences/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'
import PreferencesStep from '../steps/PreferencesStep'

export default function PreferencesPage() {
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
      .select('nom')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.nom) {
          setChecking(false)
        } else {
          router.replace('/onboarding/profile')
        }
      })
  }, [user, router])

  if (checking) return <Spinner size="lg" variant="premium" label="Vérification..." />

  return <PreferencesStep />
}