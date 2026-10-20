// app/api/admin/commandes/[id]/assigner-livreur/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import crypto from 'crypto'

// ─── Génération d’un code alphanumérique 6 caractères ─────────
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0,O,1,I,l
const CODE_LENGTH = 6

function generateSecureCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

// ─── Validation du corps ─────────────────────────────────────────
const bodySchema = z.object({
  livreur_id: z.string().uuid('ID livreur invalide'),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-assign-livreur:${ip}`,
    maxRequests: 15,
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

  const { livreur_id } = parsedBody.data

  try {
    const supabase = await createClient(true)

    // Vérifier que le livreur existe
    const { data: livreur, error: livreurErr } = await supabase
      .from('livreurs')
      .select('id')
      .eq('id', livreur_id)
      .single()

    if (livreurErr || !livreur) {
      return NextResponse.json({ error: 'Livreur introuvable' }, { status: 404 })
    }

    // Vérifier que la commande existe
    const { data: commande, error: commandeErr } = await supabase
      .from('commandes')
      .select('id, code_livreur')
      .eq('id', parsedId.data)
      .single()

    if (commandeErr || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Générer un code livreur unique
    let codeLivreur = ''
    let attempts = 0
    const MAX_ATTEMPTS = 5
    while (attempts < MAX_ATTEMPTS) {
      codeLivreur = generateSecureCode()
      // Vérifier l'unicité (hors commande courante)
      const { data: existing } = await supabase
        .from('commandes')
        .select('id')
        .eq('code_livreur', codeLivreur)
        .neq('id', parsedId.data)
        .maybeSingle()

      if (!existing) break
      attempts++
    }

    if (attempts === MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Impossible de générer un code livreur unique' }, { status: 500 })
    }

    // Mettre à jour la commande : livreur, code, mode d'attribution
    const { error: updateErr } = await supabase
      .from('commandes')
      .update({
        livreur_id,
        code_livreur: codeLivreur,
        mode_attribution: 'ASSIGNE', // car assignation manuelle par l'admin
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedId.data)

    if (updateErr) {
      logger.error(`Erreur assignation livreur à commande ${parsedId.data}`, updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    logger.info(`Livreur ${livreur_id} assigné à la commande ${parsedId.data}, code_livreur généré`)

    return NextResponse.json({
      success: true,
      code_livreur: codeLivreur, // utile pour debug/admin
    })
  } catch (error: any) {
    logger.error('Crash PUT assigner-livreur', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}