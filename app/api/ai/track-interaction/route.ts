// app/api/ai/track-interaction/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { trackInteraction } from '@/lib/ai/trainingDataCollector'
import { createServiceClient as supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    // Récupération de l'utilisateur connecté via Supabase Server Client
    const { data: { user }, error: authError } = await supabaseServer().auth.getUser()
    
    let userId = user?.id

    // Gestion de la session résiliente pour le développement local
    if (authError || !userId) {
      if (process.env.NODE_ENV === 'development') {
        // ID fictif pour éviter les blocages 401 en cours de dev si tu n'as pas de session active
        userId = '00000000-0000-0000-0000-000000000000'
      } else {
        // En production, la sécurité reste stricte et bloque l'accès
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { productId, interactionType, weight } = body

    // Validation des données requises
    if (!productId || !interactionType) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
    }

    // Enregistrement sécurisé du signal d'interaction
    try {
      await trackInteraction(userId, productId, interactionType, { weight })
    } catch (trackError) {
      // On logge l'erreur en local mais on N'EMPÊCHE PAS l'utilisateur de voir ses produits
      console.warn('⚠️ Le collecteur d\'interactions (Redis/Logger) a échoué en arrière-plan:', trackError)
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Log précis visible dans ton terminal PowerShell pour le débuggage local
    console.error('Erreur API track-interaction:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}