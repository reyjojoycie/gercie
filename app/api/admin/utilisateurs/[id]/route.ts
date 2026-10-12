// app/api/admin/utilisateurs/[id]/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-user-detail:${ip}`,
    maxRequests: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }), rateLimitHeaders)
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Récupérer le profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    // Récupérer les commandes de l'utilisateur
    const { data: commandes, error: commandesError } = await supabase
      .from('commandes')
      .select('id, numero, statut, total_global, created_at')
      .eq('acheteur_id', id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Récupérer les transactions liées à l'utilisateur
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, type, montant, description, created_at, status')
      .or(`from_user_id.eq.${id},to_user_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      profile,
      commandes: commandes || [],
      transactions: transactions || [],
    })
  } catch (error: any) {
    logger.error(error, `Crash GET admin/utilisateurs/${id}`)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}