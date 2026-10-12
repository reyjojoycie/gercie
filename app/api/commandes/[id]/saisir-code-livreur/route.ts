// app/api/commandes/[id]/saisir-code-livreur/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { normalizeCode } from '@/lib/codes'
import { isCodeBlocked, recordAttempt, isCodeAlreadyUsed, remainingAttempts } from '@/lib/anti-fraude'

const bodySchema = z.object({
  code_livreur: z.string().min(1, 'Le code livreur est requis'),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-saisir-code-livreur:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { code_livreur } = parsedBody.data
  const codeSaisi = normalizeCode(code_livreur)

  const supabase = await createClient(true)

  // Récupérer la commande
  const { data: commande, error: commandeErr } = await supabase
    .from('commandes')
    .select('id, statut, code_livreur, livreur_id')
    .eq('id', parsedId.data)
    .single()

  if (commandeErr || !commande) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  // Vérifier le statut
  const statutsValides = ['conditionnement_premium', 'collecte']
  if (!statutsValides.includes(commande.statut)) {
    return NextResponse.json(
      { error: `Action impossible depuis le statut "${commande.statut}"` },
      { status: 422 }
    )
  }

  if (!commande.code_livreur) {
    return NextResponse.json(
      { error: 'Aucun livreur assigné à cette commande.' },
      { status: 422 }
    )
  }

  // Vérifications anti-fraude
  const [bloqué, déjàUtilisé] = await Promise.all([
    isCodeBlocked(supabase, parsedId.data, 'LIVREUR'),
    isCodeAlreadyUsed(supabase, parsedId.data, 'LIVREUR'),
  ])

  if (bloqué) {
    return NextResponse.json(
      { error: 'Trop de tentatives échouées. Veuillez réessayer plus tard.' },
      { status: 429 }
    )
  }

  if (déjàUtilisé) {
    return NextResponse.json(
      { error: 'Ce code a déjà été utilisé avec succès.' },
      { status: 400 }
    )
  }

  // Comparaison
  const estValide = codeSaisi === normalizeCode(commande.code_livreur)

  // Récupérer l'utilisateur admin
  const { data: { user } } = await supabase.auth.getUser()
  const utilisateurId = user?.id
  const utilisateurEmail = user?.email || 'admin'

  // Enregistrer la tentative
  await recordAttempt(
    supabase,
    parsedId.data,
    'LIVREUR',
    code_livreur.trim(),
    estValide,
    utilisateurId,
    'ADMIN',
    ip,
  )

  if (!estValide) {
    const restantes = await remainingAttempts(supabase, parsedId.data, 'LIVREUR')
    logger.warn(`Tentative échouée saisie code livreur commande ${parsedId.data}, code saisi: ${codeSaisi}`)
    return NextResponse.json(
      { error: 'Code livreur invalide.', tentatives_restantes: restantes },
      { status: 400 }
    )
  }

  // Succès : mise à jour du statut
  const { error: updateErr } = await supabase
    .from('commandes')
    .update({
      statut: 'en_livraison',
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsedId.data)

  if (updateErr) {
    logger.error(updateErr, `Erreur mise à jour statut commande ${parsedId.data}`)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Historique
  await supabase.from('historique_statuts').insert({
    commande_id: parsedId.data,
    ancien_statut: commande.statut,
    nouveau_statut: 'en_livraison',
    motif: 'Validation collecte par saisie du code livreur',
    cree_par: utilisateurEmail,
    cree_le: new Date().toISOString(),
  })

  logger.info(`Code livreur saisi avec succès pour commande ${parsedId.data} par ${utilisateurEmail}`)

  return NextResponse.json({ success: true, nouveau_statut: 'en_livraison' })
}