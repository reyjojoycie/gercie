// app/api/user/loyalty/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getUserLoyaltyProfile } from '@/features/loyalty/services/loyaltyService'
import logger from '@/lib/logger'

export async function GET() {
  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Récupérer le profil de fidélité
    const loyaltyProfile = await getUserLoyaltyProfile(user.id)

    // 3. Réponse structurée
    return NextResponse.json({
      level: loyaltyProfile.level,
      points: loyaltyProfile.points,
      totalSpent: loyaltyProfile.totalSpent,
      nextLevel: loyaltyProfile.nextLevel,
      pointsToNextLevel: loyaltyProfile.pointsToNextLevel,
      benefits: loyaltyProfile.benefits,
      progressPercent: loyaltyProfile.progressPercent,
    })
  } catch (error: any) {
    logger.error('Erreur récupération profil fidélité', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}
