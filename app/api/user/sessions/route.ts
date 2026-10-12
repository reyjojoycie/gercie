// app/api/user/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  // Vérifier la session
  const supabase = await createClient(false)
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession()

  if (authError || !session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    // Utiliser le client admin pour lister les sessions
    const adminClient = await createClient(true)
    const { data, error } = await adminClient.auth.admin.listUserSessions(
      session.user.id
    )

    if (error) {
      console.error('Erreur liste sessions:', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Formater les sessions pour le frontend
    const sessions = (data?.sessions || []).map((s: any) => ({
      id: s.id,
      ip: s.ip,
      user_agent: s.user_agent,
      created_at: s.created_at,
      last_active: s.last_sign_in_at || s.created_at,
      is_current: s.id === session.access_token, // comparaison approximative, améliorable
    }))

    // Marquer la session courante plus précisément
    // L'ID de la session courante n'est pas directement exposé, on peut comparer avec le token
    // Alternative : utiliser l'ID de la session stocké dans le cookie
    const currentSessionId = session.access_token // ou un identifiant de session si disponible
    const formattedSessions = sessions.map((s: any) => ({
      ...s,
      is_current: s.id === currentSessionId,
    }))

    return NextResponse.json({ sessions: formattedSessions })
  } catch (err: any) {
    console.error('Erreur inattendue sessions:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}