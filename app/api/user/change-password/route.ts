// app/api/user/change-password/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'

// Schéma Zod pour le changement de mot de passe
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est requis'),
  newPassword: z.string().min(6, 'Le nouveau mot de passe doit contenir au moins 6 caractères'),
})

export async function POST(request: Request) {
  try {
    // 1. Authentification
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Validation des données entrantes
    const rawBody = await request.json()
    const parsed = changePasswordSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data

    // 3. Vérifier le mot de passe actuel
    const supabase = await createClient() // pas de service_role nécessaire
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    })

    if (signInError) {
      logger.warn({ userId: user.id }, 'Tentative de changement de mot de passe avec un mauvais mot de passe actuel')
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 })
    }

    // 4. Mettre à jour le mot de passe
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      logger.error(updateError, 'Erreur lors de la mise à jour du mot de passe')
      return NextResponse.json({ error: 'Impossible de modifier le mot de passe' }, { status: 500 })
    }

    logger.info({ userId: user.id }, 'Mot de passe modifié avec succès')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(error, 'Crash dans change-password')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}
