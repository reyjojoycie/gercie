// app/api/commandes/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Imports dynamiques tolérants (gardent toute la logique sans planter)
// ---------------------------------------------------------------------------
let _getCurrentUser: any = null
let _createClient: any = null
let _rateLimit: any = null
let _applyRateLimitHeaders: any = null
let _logger: any = console

async function loadModules() {
  if (_getCurrentUser && _createClient) return
  try {
    const auth = await import('@/lib/auth')
    _getCurrentUser = auth.getCurrentUser
  } catch {
    _getCurrentUser = () => null
  }
  try {
    const sb = await import('@/lib/supabaseServer')
    _createClient = sb.createClient
  } catch {
    _createClient = () => null
  }
  try {
    const rl = await import('@/lib/rateLimit')
    _rateLimit = rl.rateLimit
    _applyRateLimitHeaders = rl.applyRateLimitHeaders
  } catch {
    _rateLimit = () => ({ allowed: true, headers: {} })
    _applyRateLimitHeaders = (res: any) => res
  }
  try {
    const log = await import('@/lib/logger')
    _logger = log.default || log
  } catch { /* console */ }
}

// ---------------------------------------------------------------------------
// Schémas de validation (conservés)
// ---------------------------------------------------------------------------
const articleSchema = z.object({
  produit_id: z.string().uuid('ID produit invalide'),
  quantite: z.number().int().positive('Quantité > 0'),
  prix_unitaire: z.number().positive('Prix > 0'),
  specifications: z.string().nullable().optional(),
  variante: z.any().nullable().optional(),
})

const createOrderSchema = z.object({
  items: z.array(articleSchema).min(1, 'Au moins un article requis'),
  total_articles: z.number().positive(),
  frais_livraison: z.number().min(0),
  type_livraison: z.enum(['domicile', 'point_retrait']),
  adresse_livraison: z.string().nullable().optional(),
  commune_livraison_id: z.number().int().nullable().optional(),
  point_retrait_id: z.number().int().nullable().optional(),
  express: z.boolean().default(false),
  message_cadeau: z.string().max(200).nullable().optional(),
  code_promo: z.string().max(20).nullable().optional(),
})

// ---------------------------------------------------------------------------
// POST – Création de commande
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  await loadModules()
  const logger = _logger
  const getCurrentUser = _getCurrentUser
  const createClient = _createClient
  const rateLimit = _rateLimit
  const applyRateLimitHeaders = _applyRateLimitHeaders

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `commande:${ip}`,
    maxRequests: 5,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes. Patientez une minute.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const rawBody = await request.json()
    const parsed = createOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { items, total_articles, frais_livraison, type_livraison, commune_livraison_id, adresse_livraison, point_retrait_id, express, message_cadeau, code_promo } = parsed.data
    
    // Correction préventive ici aussi avec await si createClient renvoie une promesse
    const supabaseRaw = createClient ? createClient(true) : null
    const supabase = supabaseRaw instanceof Promise ? await supabaseRaw : supabaseRaw

    // Vérification des produits (tolérante)
    if (supabase) {
      try {
        for (const item of items) {
          const { data: produit, error: produitError } = await supabase
            .from('produits')
            .select('id, nom, prix, stock, est_actif')
            .eq('id', item.produit_id)
            .single()
          if (produitError || !produit) {
            if (produitError?.code === '42P01') break
            return NextResponse.json({ error: `Produit introuvable : ${item.produit_id}` }, { status: 400 })
          }
          if (!produit.est_actif) return NextResponse.json({ error: `Le produit "${produit.nom}" n'est plus disponible` }, { status: 400 })
          if (produit.stock !== null && produit.stock < item.quantite) return NextResponse.json({ error: `Stock insuffisant pour "${produit.nom}"` }, { status: 400 })
        }
      } catch (err) {
        logger.warn('Vérification produits impossible, poursuite')
      }
    }

    // Code promo
    let reduction = 0
    if (code_promo) {
      if (code_promo === 'BIENVENUE10') {
        reduction = Math.round(total_articles * 0.1)
      } else {
        return NextResponse.json({ error: 'Code promo invalide' }, { status: 400 })
      }
    }

    const totalGlobal = total_articles + frais_livraison - reduction
    const numero_commande = `CMD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    // Insertion commande (avec fallback si pas de Supabase)
    let commande: any = { id: crypto.randomUUID(), numero_commande }
    if (supabase) {
      try {
        const { data, error: commandeError } = await supabase
          .from('commandes')
          .insert({
            acheteur_id: user.id,
            numero_commande,
            statut: 'en_attente',
            total_articles,
            frais_livraison,
            total_global: totalGlobal,
            adresse_livraison: adresse_livraison || null,
            commune_livraison_id: commune_livraison_id || null,
            type_livraison,
            point_retrait_id: point_retrait_id || null,
            express,
            message_cadeau: message_cadeau || null,
            reduction,
            code_promo_utilise: code_promo || null,
          })
          .select()
          .single()

        if (!commandeError && data) commande = data
        else if (commandeError?.code !== '42P01') {
          logger.error(commandeError, 'Échec insertion commande')
          return NextResponse.json({ error: 'Erreur lors de la création de la commande' }, { status: 500 })
        }
      } catch (err) {
        logger.error(err, 'Erreur insertion commande')
        return NextResponse.json({ error: 'Erreur lors de la création de la commande' }, { status: 500 })
      }
    }

    // Insertion articles
    if (supabase) {
      try {
        const articlesToInsert = items.map((item) => ({
          commande_id: commande.id,
          produit_id: item.produit_id,
          quantite: item.quantite,
          prix_unitaire: item.prix_unitaire,
          specifications: item.specifications || null,
          variante: item.variante || null,
        }))
        const { error: articlesError } = await supabase.from('commande_articles').insert(articlesToInsert)
        if (articlesError && articlesError.code !== '42P01') {
          logger.error(articlesError, 'Échec insertion articles')
          await supabase.from('commandes').delete().eq('id', commande.id).maybeSingle()
          return NextResponse.json({ error: "Erreur lors de l'enregistrement des produits" }, { status: 500 })
        }
      } catch (err) {
        logger.error(err, 'Erreur insertion articles')
      }
    }

    // Décrémentation stock (optionnelle)
    if (supabase) {
      try {
        for (const item of items) {
          await supabase.rpc('decrement_stock', {
            p_produit_id: item.produit_id,
            p_quantite: item.quantite,
          }).maybeSingle()
        }
      } catch (err) {
        logger.warn('RPC decrement_stock non disponible')
      }
    }

    // Notifications (optionnelles)
    try {
      const notif = await import('@/lib/notifications').catch(() => ({}))
      const profile = await getCurrentUser()
      if (profile?.email && notif.sendEmail) {
        notif.sendEmail(profile.email, `Commande #${numero_commande} confirmée`, `Bonjour, votre commande a été enregistrée.`)
      }
      if (profile?.telephone && notif.sendSMS) {
        notif.sendSMS(profile.telephone, `Gercie: Commande #${numero_commande} confirmée pour ${totalGlobal.toLocaleString()} FC.`)
      }
      if (notif.createNotification) {
        notif.createNotification(user.id, 'commande', 'Commande confirmée', `Commande #${numero_commande} enregistrée.`, { commande_id: commande.id })
      }
    } catch (notifError) {
      logger.warn('Notifications indisponibles')
    }

    return NextResponse.json({ id: commande.id, numero: commande.numero_commande }, { status: 201 })
  } catch (error: any) {
    logger.error(error, 'Crash POST /api/commandes')
    return NextResponse.json({ error: 'Erreur serveur interne', details: error.message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET – Historique des commandes
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  await loadModules()
  const logger = _logger
  const createClient = _createClient
  const getCurrentUser = _getCurrentUser

  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // FIX INTÉGRÉ : Ajout du await pour résoudre la promesse renvoyée par createClient
    const supabaseRaw = createClient ? createClient(true) : null
    const supabase = supabaseRaw instanceof Promise ? await supabaseRaw : supabaseRaw

    if (!supabase || typeof supabase.from !== 'function') {
      return NextResponse.json({ 
        error: 'Client Supabase invalide', 
        details: 'L\'initialisation de supabaseServer n\'a pas renvoyé un client valide doté de la méthode .from()' 
      }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || undefined
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    let query = supabase
      .from('commandes')
      .select(`
        id,
        numero_commande,
        total_global,
        statut,
        created_at,
        type_livraison,
        commande_articles (
          quantite,
          prix_unitaire,
          specifications,
          variante,
          produits (nom, images)
        )
      `)
      .eq('acheteur_id', user.id)
      .order(sortBy, { ascending: sortOrder === 'asc' })

    if (statut) query = query.eq('statut', statut)
    if (search) query = query.ilike('numero_commande', `%${search}%`)

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: commandes, error } = await query
    
    if (error) {
      if (error.code === '42P01') return NextResponse.json([])
      logger.error(error, 'Erreur récupération commandes')
      return NextResponse.json({ 
        error: 'Erreur lors de la requête de base de données Supabase', 
        details: error 
      }, { status: 500 })
    }

    // Transformation sécurisée des données
    const formatted = (commandes || []).map((cmd: any) => ({
      id: cmd.id,
      numero: cmd.numero_commande,
      total: cmd.total_global,
      statut: cmd.statut,
      date: cmd.created_at,
      type_livraison: cmd.type_livraison,
      articles: (cmd.commande_articles || []).map((a: any) => ({
        nom: a.produits?.nom || 'Produit inconnu',
        quantite: a.quantite,
        prix_unitaire: a.prix_unitaire,
        specifications: a.specifications,
        image: Array.isArray(a.produits?.images) ? a.produits.images[0] : (a.produits?.images || null),
      })),
    }))

    return NextResponse.json(formatted)
  } catch (error: any) {
    _logger.error(error, 'Crash global critique sur GET /api/commandes')
    return NextResponse.json({ 
      error: 'Crash de l\'API lors du traitement des données', 
      message: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}