// app/api/user/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Vérifier la session
  const supabase = await createClient(false)
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession()

  if (authError || !session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Valider l'ID de la session
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'ID de session invalide' }, { status: 400 })
  }

  const sessionIdToRevoke = parsed.data.id

  try {
    const adminClient = await createClient(true)

    // Vérifier que la session appartient bien à l'utilisateur
    const { data: sessionsData, error: listError } =
      await adminClient.auth.admin.listUserSessions(session.user.id)

    if (listError) {
      console.error('Erreur liste sessions:', listError)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const userSessions = sessionsData?.sessions || []
    const targetSession = userSessions.find((s: any) => s.id === sessionIdToRevoke)

    if (!targetSession) {
      return NextResponse.json(
        { error: 'Session introuvable ou ne vous appartient pas' },
        { status: 404 }
      )
    }

    // Empêcher la révocation de la session courante (optionnel mais recommandé)
    // Comme on ne peut pas identifier à coup sûr la session courante,
    // on peut comparer la date de dernière activité ou la date de création.
    // Ici, on laisse la révocation si l'ID correspond exactement.
    // À toi d'ajuster si besoin.

    // Révoquer la session
    const { error: revokeError } = await adminClient.auth.admin.revokeSession(
      sessionIdToRevoke
    )

    if (revokeError) {
      console.error('Erreur révocation session:', revokeError)
      return NextResponse.json({ error: 'Erreur lors de la révocation' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Session révoquée' })
  } catch (err: any) {
    console.error('Erreur inattendue révocation:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}