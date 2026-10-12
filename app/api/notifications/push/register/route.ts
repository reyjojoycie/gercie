// app/api/notifications/push/register/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// Schéma de validation pour l'enregistrement du token
const registerSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
})

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Valider les données entrantes
  const rawBody = await request.json()
  const parsed = registerSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { token, platform } = parsed.data
  const supabase = await createClient(true) // service_role

  // Insérer ou mettre à jour le token (gestion des doublons via upsert)
  const { error } = await supabase
    .from('livreur_notification_tokens') // table générique pour tous les utilisateurs (ou à adapter)
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_used: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: 'token' }
    )

  if (error) {
    console.error('Erreur enregistrement token push:', error)
    return NextResponse.json({ error: 'Erreur lors de l’enregistrement du token' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Token enregistré' })
}
