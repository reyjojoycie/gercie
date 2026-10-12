import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const moyenPaiementSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  code: z.string().min(1, 'Le code est requis'),
  type: z.enum(['wallet', 'card', 'mobile_money']).default('mobile_money'),
  logo_url: z.string().url().optional().nullable(),
  instructions: z.string().optional().nullable(),
  ordre: z.number().int().min(0).default(0),
  actif: z.boolean().default(true),
})

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-get:${ip}`,
    maxRequests: 30,
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

  const supabase = await createClient(false) // Ou juste createClient()

  const { data, error } = await supabase
    .from('moyens_paiement')
    .select('*')
    .order('ordre', { ascending: true })

  if (error) {
    // Log complet pour déboguer dans le terminal
    console.error("Erreur Supabase GET:", error)
    logger.error(error, 'Erreur GET moyens_paiement')
    return NextResponse.json({ error: 'Erreur lors de la récupération des données', details: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-post:${ip}`,
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

  const supabase = await createClient(true)

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = moyenPaiementSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { error: insertErr } = await supabase
    .from('moyens_paiement')
    .insert([{
      nom: parsed.data.nom,
      code: parsed.data.code,
      type: parsed.data.type,
      logo_url: parsed.data.logo_url,
      instructions: parsed.data.instructions,
      ordre: parsed.data.ordre,
      actif: parsed.data.actif,
    }])

  if (insertErr) {
    // Log complet pour déboguer dans le terminal
    console.error("Erreur Supabase POST:", insertErr)
    
    if (insertErr.code === '42501') {
      return NextResponse.json({ error: 'Permission refusée par la base de données (RLS)' }, { status: 403 })
    }
    
    logger.error(insertErr, 'Erreur création moyen de paiement')
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  logger.info(`Nouveau moyen de paiement créé : ${parsed.data.nom}`)
  return NextResponse.json({ success: true })
}