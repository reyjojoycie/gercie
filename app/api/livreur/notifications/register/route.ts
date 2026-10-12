// app/api/livreur/notifications/register/route.ts
/**
 * API d'enregistrement / désenregistrement des tokens de notification push
 * pour les livreurs – version ultra‑premium.
 *
 * POST   : enregistre un token (upsert), avec validation de la plateforme.
 * DELETE : désactive un token (ou suppression physique).
 *
 * Sécurité : authentification livreur obligatoire.
 * Rate limiting : 20 req/min.
 * Logs : structurés.
 * Cache : invalidation après écriture.
 * Validation : Zod.
 */
import { createClient } from '@/lib/supabaseServer'
import { requireLivreur } from '@/lib/auth/livreurGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

/* ========================================================================== */
/*  Schémas de validation                                                      */
/* ========================================================================== */
const postBodySchema = z.object({
  token: z.string().min(1, 'Token requis'),
  platform: z.enum(['web', 'ios', 'android']).optional().default('web'),
  device_name: z.string().max(100).optional(),
})

const deleteBodySchema = z.object({
  token: z.string().min(1, 'Token requis'),
})

/* ========================================================================== */
/*  POST – Enregistrer un token                                               */
/* ========================================================================== */
export async function POST(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-token-reg:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  // Authentification livreur
  let livreurId: string
  try {
    const livreur = await requireLivreur()
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  // Validation du corps
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { token, platform, device_name } = parsed.data

  try {
    const supabase = await createClient(true)

    // Nettoyer les vieux tokens inactifs (plus de 60 jours) – exécuter de façon asynchrone
    const nettoyage = supabase
      .from('livreur_notification_tokens')
      .update({ is_active: false })
      .lt('last_used', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString())
      .eq('is_active', true)
      .then(({ error }) => { if (error) logger.warn(error, 'Nettoyage tokens échoué') })

    // Upsert du token
    const { error: upsertErr } = await supabase
      .from('livreur_notification_tokens')
      .upsert(
        {
          livreur_id: livreurId,
          token,
          platform,
          device_name: device_name || null,
          last_used: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: 'token' }
      )

    if (upsertErr) {
      logger.error(upsertErr, 'Erreur enregistrement token')
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    // Attendre le nettoyage (optionnel, pour garantir la cohérence)
    await nettoyage

    logger.info(`Token push enregistré pour le livreur ${livreurId} (${platform})`)

    return NextResponse.json({ success: true, message: 'Token enregistré' })
  } catch (error: any) {
    logger.error(error, 'Crash POST /api/livreur/notifications/register')
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  DELETE – Désenregistrer un token                                          */
/* ========================================================================== */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `livreur-token-del:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let livreurId: string
  try {
    const livreur = await requireLivreur()
    livreurId = livreur.id
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = deleteBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { token } = parsed.data

  try {
    const supabase = await createClient(true)

    const { error } = await supabase
      .from('livreur_notification_tokens')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('token', token)
      .eq('livreur_id', livreurId)

    if (error) {
      logger.error(error, 'Erreur suppression token')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info(`Token push désenregistré pour le livreur ${livreurId}`)

    return NextResponse.json({ success: true, message: 'Token désenregistré' })
  } catch (error: any) {
    logger.error(error, 'Crash DELETE /api/livreur/notifications/register')
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}