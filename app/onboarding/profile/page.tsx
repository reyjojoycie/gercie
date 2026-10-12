// app/onboarding/profile/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Spinner } from '@/components/ui/Spinner'
import ProfileStep from '../steps/ProfileStep'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isVerified } = useAuth()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!user) {
      router.replace('/login?redirect=/onboarding/profile')
      return
    }

    // Si l'utilisateur n'est pas vérifié, on vérifie le profil en base
    // pour s'assurer qu'il a bien vérifié au moins un canal
    if (!isVerified) {
      supabaseBrowser
        .from('profiles')
        .select('email_verified, phone_verified')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data && (data.email_verified || data.phone_verified)) {
            // Au moins un canal vérifié → OK
            setChecking(false)
          } else {
            // Aucun canal vérifié → retour à l'étape 1
            router.replace('/onboarding')
          }
        })
        .catch(() => {
          router.replace('/onboarding')
        })
    } else {
      setChecking(false)
    }
  }, [user, isVerified, router])

  if (checking) {
    return <Spinner size="lg" variant="premium" label="Vérification..." />
  }

  return <ProfileStep />
}