// app/api/commandes/[id]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// États et Modules Partagés Dynamiques
// ---------------------------------------------------------------------------
let _getCurrentUser: any = null
let _createClient: any = null
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
    // Support des configurations d'exports multiples (default ou nommé)
    _createClient = sb.createClient || sb.default || sb
  } catch {
    _createClient = () => null
  }
  try {
    const log = await import('@/lib/logger')
    _logger = log.default || log
  } catch {
    /* Utilise le console global par défaut en cas d'absence */
  }
}

// Validation stricte du format UUID pour l'identifiant de la commande
const orderIdSchema = z.string().uuid('Format de jeton de commande invalide')

export async function GET(
  request: Request,
  { params }: { params: any }
) {
  await loadModules()
  const logger = _logger
  const getCurrentUser = _getCurrentUser
  const createClient = _createClient

  try {
    // 1. Authentification de la session utilisateur
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }

    // 2. Extraction résiliente des paramètres selon la version de Next.js
    let id = ''
    if (params instanceof Promise) {
      const resolvedParams = await params
      id = resolvedParams?.id
    } else if (params && typeof params === 'object') {
      id = params.id
    }

    const parsedId = orderIdSchema.safeParse(id)
    if (!parsedId.success) {
      return NextResponse.json({ 
        error: 'Identifiant de commande invalide', 
        details: parsedId.error.flatten() 
      }, { status: 400 })
    }

    // 3. Initialisation et résolution du client Supabase
    if (!createClient) {
      return NextResponse.json({ error: 'Fichier de configuration serveur introuvable' }, { status: 500 })
    }

    // Appel du constructeur. Si le fichier retourne une promesse, on l'attend.
    let supabaseInstance = createClient(true)
    if (supabaseInstance instanceof Promise) {
      supabaseInstance = await supabaseInstance
    }

    // Résolution alternative si le client est enveloppé dans un objet exporté
    const supabase = supabaseInstance?.supabase || supabaseInstance

    if (!supabase || typeof supabase.from !== 'function') {
      logger.error('L\'instance résolue de Supabase ne contient pas la méthode .from()')
      return NextResponse.json({ 
        error: 'Erreur de configuration interne', 
        message: 'Impossible de lier le client de base de données.' 
      }, { status: 500 })
    }

    // 4. Extraction de la commande principale associée à l'acheteur connecté
    const { data: order, error: orderError } = await supabase
      .from('commandes')
      .select('*')
      .eq('id', parsedId.data)
      .eq('acheteur_id', user.id)
      .maybeSingle()

    if (orderError) {
      logger.error(orderError, 'Erreur lors de l\'interrogation de la table commandes')
      return NextResponse.json({ error: 'Erreur SQL lors du chargement', tech: orderError.message }, { status: 500 })
    }

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable ou accès non autorisé' }, { status: 404 })
    }

    // 5. Extraction sécurisée et isolée des articles pour éviter un blocage total en cas de conflit relationnel
    let formattedArticles: any[] = []
    try {
      // Tentative de récupération globale avec jointure sur la table produits
      const { data: articles, error: articlesError } = await supabase
        .from('commande_articles')
        .select(`
          quantite, 
          prix_unitaire, 
          specifications, 
          variante, 
          produits (nom, images)
        `)
        .eq('commande_id', parsedId.data)

      if (articlesError) {
        logger.warn(articlesError, 'Échec de la jointure directe, bascule sur le mode de récupération unifié')
        
        // Mode dégradé sécurisé : Extraction sans jointure relationnelle pour sauver l'affichage de la page
        const { data: fallbackArticles } = await supabase
          .from('commande_articles')
          .select('quantite, prix_unitaire, specifications, variante')
          .eq('commande_id', parsedId.data)

        formattedArticles = (fallbackArticles || []).map((a: any) => ({
          nom: 'Article de la commande',
          quantite: Number(a.quantite) || 1,
          prix_unitaire: Number(a.prix_unitaire) || 0,
          specifications: a.specifications || null,
          variante: a.variante || null,
          image: null
        }))
      } else {
        formattedArticles = (articles || []).map((a: any) => ({
          nom: a.produits?.nom || 'Produit sans nom',
          quantite: Number(a.quantite) || 1,
          prix_unitaire: Number(a.prix_unitaire) || 0,
          specifications: a.specifications || null,
          variante: a.variante || null,
          image: Array.isArray(a.produits?.images) ? a.produits.images[0] : null,
        }))
      }
    } catch (innerError) {
      logger.error(innerError, 'Exception levée pendant la mise en forme des articles')
    }

    // 6. Signature de réponse unifiée avec structures de repli (Fallback) pour l'UI premium
    return NextResponse.json({
      id: order.id,
      numero: order.numero_commande || 'N/D',
      total: Number(order.total_global) || 0,
      statut: order.statut || 'en_attente',
      date: order.created_at || new Date().toISOString(),
      type_livraison: order.type_livraison || 'standard',
      adresse_livraison: order.adresse_livraison || '',
      express: Boolean(order.express),
      message_cadeau: order.message_cadeau || null,
      reduction: Number(order.reduction) || 0,
      articles: formattedArticles,
    })

  } catch (error: any) {
    console.error('--- CRASH GÉRÉ API COMMANDES ---')
    console.error(error)
    console.error('--------------------------------')

    return NextResponse.json({
      error: 'Erreur serveur interne',
      message: error?.message || 'Une exception inconnue a interrompu le processus.',
      stack: error?.stack ? error.stack.split('\n')[0] : ''
    }, { status: 500 })
  }
}