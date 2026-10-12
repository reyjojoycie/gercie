// app/api/user/wallet/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

const walletResponseSchema = z.object({
  balance: z.number().int(),
  solde_achat: z.number().int(),
  solde_vente: z.number().int(),
  balance_usd: z.number(),
  solde_achat_usd: z.number(),
  solde_vente_usd: z.number(),
  currency: z.literal('CDF'),
  message: z.string().optional(),
})

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `wallet:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const supabase = await createClient(true) // service_role

    // 1. Tentative de lecture
    let { data: wallet, error } = await supabase
      .from('portefeuilles')
      .select('solde_achat, solde_vente')
      .eq('id', user.id)
      .single()

    // 2. Gestion de l'absence de table (42P01) : on la crée à la volée
    if (error && error.code === '42P01') {
      // Création de la table et des politiques (si autorisé par Supabase)
      const createTableSQL = `
        create table if not exists public.portefeuilles (
          id uuid primary key references auth.users(id) on delete cascade,
          solde_achat int not null default 0,
          solde_vente int not null default 0,
          created_at timestamptz default now(),
          updated_at timestamptz default now()
        );
        alter table public.portefeuilles enable row level security;
        create policy "Users can view own wallet" on public.portefeuilles for select using (auth.uid() = id);
        create policy "Users can update own wallet" on public.portefeuilles for update using (auth.uid() = id);
      `
      // Supabase permet d'exécuter du SQL via rpc('exec') si la fonction existe, sinon on tente l'insertion directe
      const { error: rpcError } = await supabase.rpc('exec', { query: createTableSQL })
      if (rpcError) {
        console.warn('Impossible de créer la table automatiquement, veuillez exécuter le script SQL manuellement.')
        // On retourne 0 plutôt que 500
        return NextResponse.json({ balance: 0, solde_achat: 0, solde_vente: 0, balance_usd: 0, solde_achat_usd: 0, solde_vente_usd: 0, currency: 'CDF' })
      }
      // Après création, insérer un portefeuille vide
      await supabase.from('portefeuilles').insert({ id: user.id, solde_achat: 0, solde_vente: 0 })
      wallet = { solde_achat: 0, solde_vente: 0 }
    } else if (error && error.code === 'PGRST116') {
      // Aucune ligne trouvée
      const { error: insertError } = await supabase
        .from('portefeuilles')
        .insert({ id: user.id, solde_achat: 0, solde_vente: 0 })
      if (insertError) {
        console.error('Insert wallet error:', insertError)
        return NextResponse.json({ balance: 0, solde_achat: 0, solde_vente: 0, balance_usd: 0, solde_achat_usd: 0, solde_vente_usd: 0, currency: 'CDF' })
      }
      wallet = { solde_achat: 0, solde_vente: 0 }
    } else if (error) {
      console.error('Wallet fetch error:', error)
      return NextResponse.json({ balance: 0, solde_achat: 0, solde_vente: 0, balance_usd: 0, solde_achat_usd: 0, solde_vente_usd: 0, currency: 'CDF' })
    }

    // Taux de change
    let rate = 0
    try {
      const { data: rateData } = await supabase
        .from('exchange_rates')
        .select('rate')
        .eq('currency', 'USD')
        .single()
      rate = rateData?.rate ?? 0
    } catch (_) {}

    const soldeAchat = wallet?.solde_achat ?? 0
    const soldeVente = wallet?.solde_vente ?? 0
    const usdAchat = rate > 0 ? parseFloat((soldeAchat / rate).toFixed(2)) : 0
    const usdVente = rate > 0 ? parseFloat((soldeVente / rate).toFixed(2)) : 0

    const data = {
      balance: soldeAchat,
      solde_achat: soldeAchat,
      solde_vente: soldeVente,
      balance_usd: usdAchat,
      solde_achat_usd: usdAchat,
      solde_vente_usd: usdVente,
      currency: 'CDF' as const,
    }

    const response = NextResponse.json(data)
    response.headers.set('Cache-Control', 'private, max-age=60')
    return response
  } catch (err) {
    console.error('Wallet route error:', err)
    return NextResponse.json({ balance: 0, solde_achat: 0, solde_vente: 0, balance_usd: 0, solde_achat_usd: 0, solde_vente_usd: 0, currency: 'CDF' })
  }
}