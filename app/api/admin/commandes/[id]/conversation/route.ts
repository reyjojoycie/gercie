// app/api/admin/commandes/[id]/conversation/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const postBodySchema = z.object({
  message: z.string().min(1, 'Le message ne peut pas être vide').max(2000, 'Message trop long'),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-conversation:${ip}`,
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

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('commande_messages')
      .select(`
        id,
        message,
        created_at,
        auteur:profiles!commande_messages_auteur_id_fkey(nom, prenom)
      `)
      .eq('commande_id', parsedId.data)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error(`Erreur récupération messages commande ${parsedId.data}`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Reformater pour un usage plus simple côté client
    const messages = (data || []).map((msg: any) => ({
      id: msg.id,
      auteur: {
        nom: msg.auteur?.nom || 'Inconnu',
        prenom: msg.auteur?.prenom || '',
      },
      message: msg.message,
      created_at: msg.created_at,
    }))

    return NextResponse.json(messages)
  } catch (error: any) {
    logger.error(`Crash GET conversation commande/${id}`, error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-commande-conversation-post:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  let currentUser: { id: string }
  try {
    currentUser = await requireAdmin()
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

  const parsedBody = postBodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { message } = parsedBody.data

  try {
    const supabase = await createClient(true)

    // Vérifier que la commande existe
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select('id')
      .eq('id', parsedId.data)
      .single()

    if (cmdError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Insérer le message
    const { data: newMsg, error: insertErr } = await supabase
      .from('commande_messages')
      .insert({
        commande_id: parsedId.data,
        auteur_id: currentUser.id,
        message,
      })
      .select('id, message, created_at')
      .single()

    if (insertErr) {
      logger.error(`Erreur insertion message commande ${parsedId.data}`, insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    logger.info(`Message ajouté à la commande ${parsedId.data} par ${currentUser.id}`)
    return NextResponse.json(newMsg, { status: 201 })
  } catch (error: any) {
    logger.error(`Crash POST conversation commande/${id}`, error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}