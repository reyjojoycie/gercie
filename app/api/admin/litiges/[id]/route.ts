// app/api/admin/litiges/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendEmail, createNotification } from '@/lib/notifications'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient(true)

  // Vérifier admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await request.json()
  const { statut, resolution } = body

  if (!statut) {
    return NextResponse.json({ error: 'Statut requis' }, { status: 400 })
  }

  // Construire l'objet de mise à jour
  const updateData: any = {
    statut,
    updated_at: new Date().toISOString(),
    resolved_by: user.id, // enregistrer l'ID de l'admin qui a traité le litige
  }

  if (resolution) {
    updateData.resolution = resolution
  }

  if (statut === 'resolu' || statut === 'rejete') {
    updateData.resolved_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('litiges')
    .update(updateData)
    .eq('id', params.id)

  if (error) {
    console.error('Erreur mise à jour litige:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer les infos du litige pour notifier l'utilisateur
  const { data: litige } = await supabase
    .from('litiges')
    .select('user_id, description, commande_id')
    .eq('id', params.id)
    .single()

  if (litige?.user_id) {
    const { data: utilisateur } = await supabase
      .from('profiles')
      .select('email, prenom')
      .eq('id', litige.user_id)
      .single()

    if (utilisateur) {
      const sujet = statut === 'resolu'
        ? 'Votre litige a été résolu'
        : 'Votre litige a été ' + (statut === 'rejete' ? 'rejeté' : 'mis à jour')

      const message = `Le litige concernant "${litige.description?.substring(0, 50)}..." a été ${statut === 'resolu' ? 'résolu' : statut === 'rejete' ? 'rejeté' : 'mis à jour'}.`
      if (resolution) {
        // Ajouter la résolution dans le mail si présente
      }

      await sendEmail(
        utilisateur.email,
        sujet,
        `<p>Bonjour ${utilisateur.prenom},</p><p>${message}${resolution ? `<br/>Résolution : ${resolution}` : ''}</p>`
      )

      await createNotification(
        litige.user_id,
        'litige',
        sujet,
        message,
        { litige_id: params.id, resolution }
      )
    }
  }

  return NextResponse.json({ success: true })
}