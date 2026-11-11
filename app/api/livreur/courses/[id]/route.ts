// app/api/livreur/courses/[id]/route.ts
// ============================================================================
// API Livreur – Détail et actions sur une course
// Version complète, sécurisée et sans wallet / portefeuille / solde / retrait.
//
// Endpoints :
// - GET  /api/livreur/courses/:id
// - POST /api/livreur/courses/:id
//
// Actions POST :
// { "action": "accept" }
//
// { "action": "validate-article", "article_id": "...", "code": "123456" }
//
// {
//   "action": "refuse-article",
//   "article_id": "...",
//   "motif": "...",
//   "photo_preuve": "https://..."
// }
//
// {
//   "action": "deliver",
//   "code_client": "A1B2C3",
//   "photos_livraison": ["https://..."],
//   "signature_client": "data:image/png;base64,...",
//   "geoloc": {
//     "latitude": -4.3217,
//     "longitude": 15.3125,
//     "accuracy": 20
//   }
// }
//
// {
//   "action": "signal",
//   "type": "client_absent",
//   "message": "...",
//   "photo": "https://..."
// }
// ============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const LIVRAISONS_TABLE = 'livraisons'
const COMMANDES_TABLE = 'commandes'
const ARTICLES_TABLE = 'commande_articles'
const PRODUITS_TABLE = 'produits'
const PROFILES_TABLE = 'profiles'
const VENDEURS_TABLE = 'vendeurs'
const SIGNALEMENTS_TABLES = ['course_signals', 'livreur_signalements']

const MAX_CODE_ATTEMPTS = 3

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS GÉNÉRAUX                                               */
/* ═══════════════════════════════════════════════════════════════ */

function nowIso(): string {
  return new Date().toISOString()
}

function errorMessage(error: any, fallback: string): string {
  return String(error?.message || error?.details || error?.hint || fallback)
}

function isTableMissingError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

function isColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '42703' ||
    message.includes('column') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  )
}

function extractMissingColumn(message: string): string | null {
  const patterns = [
    /column\s+"([^"]+)"/i,
    /column\s+([a-zA-Z0-9_]+)/i,
    /could not find .*?["']([a-zA-Z0-9_]+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) return true
  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function toStringArray(payload: any): string[] {
  if (!payload) return []

  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === 'string') return item
        return item?.url || item?.publicUrl || item?.path || ''
      })
      .filter(Boolean)
  }

  if (typeof payload === 'string') {
    return payload
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function normalizeRole(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function hasRole(values: unknown[], expected: string): boolean {
  return values.some((value) => normalizeRole(value) === expected)
}

function generateNumericCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString()
  }
  return code
}

function generateAlphaCode(length = 6): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  for (let i = 0; i < length; i += 1) {
    code += charset[Math.floor(Math.random() * charset.length)]
  }

  return code
}

function normalizeStatus(value: unknown): string {
  const raw = String(value || 'en_attente')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

  const aliases: Record<string, string> = {
    delivered: 'livree',
    completed: 'livree',
    termine: 'livree',
    terminee: 'livree',

    cancelled: 'annulee',
    canceled: 'annulee',
    refusee: 'annulee',
    echouee: 'annulee',
    failed: 'annulee',

    assigned: 'acceptee',
    accepted: 'acceptee',
    acceptee: 'acceptee',

    picked_up: 'colis_recupere',
    recupere: 'colis_recupere',
    collecte: 'colis_recupere',

    in_transit: 'en_route',
    en_cours: 'en_route',
    route: 'en_route',

    pending: 'en_attente',
    en_attente: 'en_attente',
  }

  return aliases[raw] || raw
}

function normalizeCollectStatus(value: unknown): 'en_attente' | 'accepte' | 'refuse' {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

  if (['accepte', 'valide', 'ok', 'collecte', 'recupere'].includes(raw)) {
    return 'accepte'
  }

  if (['refuse', 'rejete', 'cancel', 'annule'].includes(raw)) {
    return 'refuse'
  }

  return 'en_attente'
}

async function resolveRouteId(params: any): Promise<string | null> {
  try {
    const resolved = await params
    if (resolved && typeof resolved.id === 'string') return resolved.id
  } catch {
    // Next.js 14 peut déjà fournir un objet
  }

  if (params && typeof params.id === 'string') return params.id

  return null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SUPABASE                                                       */
/* ═══════════════════════════════════════════════════════════════ */

async function getSupabaseClients(): Promise<{
  supabase: any
  supabaseAdmin: any
}> {
  const userClient: any = await createClient(false)
  const adminClient: any = await createClient(true)

  return {
    supabase: userClient?.supabase ?? userClient,
    supabaseAdmin: adminClient?.supabase ?? adminClient,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AUTH LIVREUR                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface AuthResult {
  response?: NextResponse
  user?: any
  livreurId?: string
  supabaseAdmin?: any
}

async function authenticateLivreur(): Promise<AuthResult> {
  try {
    const { supabase, supabaseAdmin } = await getSupabaseClients()

    if (!supabase || !supabaseAdmin) {
      return {
        response: NextResponse.json(
          {
            error: 'Configuration Supabase invalide côté serveur.',
            code: 'SUPABASE_CLIENT_ERROR',
          },
          { status: 500 }
        ),
      }
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData?.user) {
      return {
        response: NextResponse.json(
          {
            error: 'Authentification requise.',
            code: 'UNAUTHORIZED',
          },
          { status: 401 }
        ),
      }
    }

    const user = authData.user

    const metadataRoles = [
      user?.user_metadata?.role,
      user?.user_metadata?.type_user,
      user?.app_metadata?.role,
      user?.app_metadata?.type_user,
      user?.role,
    ].filter(Boolean)

    if (hasRole(metadataRoles, 'livreur')) {
      return { user, livreurId: user.id, supabaseAdmin }
    }

    try {
      const { data: profile } = await supabaseAdmin
        .from(PROFILES_TABLE)
        .select('id, type_user, role, is_admin')
        .eq('id', user.id)
        .maybeSingle()

      const profileRoles = [profile?.type_user, profile?.role].filter(Boolean)

      if (hasRole(profileRoles, 'livreur')) {
        return { user, livreurId: user.id, supabaseAdmin }
      }
    } catch {
      // profiles peut être absent ou interdit : on continue
    }

    try {
      const { data: livreurById } = await supabaseAdmin
        .from('livreurs')
        .select('id, user_id')
        .eq('id', user.id)
        .maybeSingle()

      if (livreurById) {
        return {
          user,
          livreurId: String(livreurById.id || user.id),
          supabaseAdmin,
        }
      }
    } catch {
      // livreurs peut être absent : on continue
    }

    try {
      const { data: livreurByUserId } = await supabaseAdmin
        .from('livreurs')
        .select('id, user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (livreurByUserId) {
        return {
          user,
          livreurId: String(livreurByUserId.id || user.id),
          supabaseAdmin,
        }
      }
    } catch {
      // colonne user_id peut être absente : on continue
    }

    return {
      response: NextResponse.json(
        {
          error: 'Accès réservé aux livreurs.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    }
  } catch (error: any) {
    log.error?.('Crash authenticateLivreur', error)

    return {
      response: NextResponse.json(
        {
          error: 'Erreur serveur lors de la vérification du livreur.',
          code: 'INTERNAL_ERROR',
          details:
            process.env.NODE_ENV === 'development'
              ? errorMessage(error, 'Erreur inconnue')
              : undefined,
        },
        { status: 500 }
      ),
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  UPDATE / INSERT TOLÉRANTS                                      */
/* ═══════════════════════════════════════════════════════════════ */

async function updateByIdWithFallback(
  supabaseAdmin: any,
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ data: any | null; error: any | null }> {
  let currentPayload = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(currentPayload).length === 0) {
      return {
        data: null,
        error: {
          message: 'Aucune colonne disponible pour la mise à jour.',
          code: 'EMPTY_UPDATE',
        },
      }
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .update(currentPayload)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    lastError = error

    if (isColumnError(error)) {
      const missingColumn = extractMissingColumn(errorMessage(error, ''))

      if (missingColumn && missingColumn in currentPayload) {
        delete currentPayload[missingColumn]
        continue
      }
    }

    break
  }

  return { data: null, error: lastError }
}

async function insertWithFallback(
  supabaseAdmin: any,
  table: string,
  payload: Record<string, unknown>
): Promise<{ data: any | null; error: any | null }> {
  let currentPayload = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(currentPayload).length === 0) {
      return {
        data: null,
        error: {
          message: 'Aucune colonne disponible pour l’insertion.',
          code: 'EMPTY_INSERT',
        },
      }
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .insert(currentPayload)
      .select('*')
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    lastError = error

    if (isColumnError(error)) {
      const missingColumn = extractMissingColumn(errorMessage(error, ''))

      if (missingColumn && missingColumn in currentPayload) {
        delete currentPayload[missingColumn]
        continue
      }
    }

    break
  }

  return { data: null, error: lastError }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOAD COURSE                                                    */
/* ═══════════════════════════════════════════════════════════════ */

type LoadCourseResult =
  | { status: 'ok'; course: any }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; error: any }

async function loadCourse(
  supabaseAdmin: any,
  routeId: string,
  livreurId: string
): Promise<LoadCourseResult> {
  try {
    let livraison: any = null
    let commandeId = routeId

    /* ------------------------------------------------------------ */
    /* 1. Essayer de charger la livraison par son id                 */
    /* ------------------------------------------------------------ */

    try {
      const { data } = await supabaseAdmin
        .from(LIVRAISONS_TABLE)
        .select('*')
        .eq('id', routeId)
        .maybeSingle()

      if (data) {
        livraison = data
        commandeId = String(
          data.commande_id || data.order_id || data.id || routeId
        )
      }
    } catch {
      // table livraisons peut être absente
    }

    /* ------------------------------------------------------------ */
    /* 2. Sinon essayer par commande_id                             */
    /* ------------------------------------------------------------ */

    if (!livraison) {
      try {
        const { data } = await supabaseAdmin
          .from(LIVRAISONS_TABLE)
          .select('*')
          .eq('commande_id', routeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data) {
          livraison = data
          commandeId = String(data.commande_id || data.id || routeId)
        }
      } catch {
        try {
          const { data } = await supabaseAdmin
            .from(LIVRAISONS_TABLE)
            .select('*')
            .eq('commande_id', routeId)
            .limit(1)
            .maybeSingle()

          if (data) {
            livraison = data
            commandeId = String(data.commande_id || data.id || routeId)
          }
        } catch {
          // ignore
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 3. Charger la commande                                       */
    /* ------------------------------------------------------------ */

    let commande: any = null

    try {
      const { data } = await supabaseAdmin
        .from(COMMANDES_TABLE)
        .select('*')
        .eq('id', commandeId)
        .maybeSingle()

      commande = data
    } catch {
      // table commandes peut être absente
    }

    if (!commande && !livraison) {
      return { status: 'not_found' }
    }

    /* ------------------------------------------------------------ */
    /* 4. Vérifier affectation                                      */
    /* ------------------------------------------------------------ */

    const livraisonLivreurId = textOrNull(
      livraison?.livreur_id ?? livraison?.livreurId
    )

    if (livraisonLivreurId && livraisonLivreurId !== livreurId) {
      return { status: 'forbidden' }
    }

    const commandeLivreurId = textOrNull(
      commande?.livreur_id ?? commande?.livreurId
    )

    if (!livraison && commandeLivreurId && commandeLivreurId !== livreurId) {
      return { status: 'forbidden' }
    }

    /* ------------------------------------------------------------ */
    /* 5. Charger le client                                         */
    /* ------------------------------------------------------------ */

    let clientProfile: any = null

    const clientId = textOrNull(
      commande?.client_id ??
        commande?.acheteur_id ??
        commande?.customer_id ??
        livraison?.client_id
    )

    if (clientId) {
      try {
        const { data } = await supabaseAdmin
          .from(PROFILES_TABLE)
          .select(
            'id, nom, prenom, email, telephone, latitude, longitude, avatar_url'
          )
          .eq('id', clientId)
          .maybeSingle()

        clientProfile = data
      } catch {
        try {
          const { data } = await supabaseAdmin
            .from(PROFILES_TABLE)
            .select('id, nom, prenom, email, telephone')
            .eq('id', clientId)
            .maybeSingle()

          clientProfile = data
        } catch {
          // ignore
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 6. Charger les articles                                      */
    /* ------------------------------------------------------------ */

    let rawArticles: any[] = []

    try {
      const { data } = await supabaseAdmin
        .from(ARTICLES_TABLE)
        .select('*')
        .eq('commande_id', commandeId)
        .order('created_at', { ascending: true })

      rawArticles = Array.isArray(data) ? data : []
    } catch {
      try {
        const { data } = await supabaseAdmin
          .from(ARTICLES_TABLE)
          .select('*')
          .eq('commande_id', commandeId)

        rawArticles = Array.isArray(data) ? data : []
      } catch {
        rawArticles = []
      }
    }

    /* ------------------------------------------------------------ */
    /* 7. Charger produits                                          */
    /* ------------------------------------------------------------ */

    const produitIds = unique(
      rawArticles.map((article) =>
        textOrNull(article?.produit_id ?? article?.product_id)
      )
    )

    const produitsMap = new Map<string, any>()

    if (produitIds.length > 0) {
      try {
        const { data } = await supabaseAdmin
          .from(PRODUITS_TABLE)
          .select('id, nom, images, vendeur_id')
          .in('id', produitIds)

        for (const produit of data ?? []) {
          produitsMap.set(String(produit.id), produit)
        }
      } catch {
        try {
          const { data } = await supabaseAdmin
            .from(PRODUITS_TABLE)
            .select('id, nom, images')
            .in('id', produitIds)

          for (const produit of data ?? []) {
            produitsMap.set(String(produit.id), produit)
          }
        } catch {
          // ignore
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 8. Charger vendeurs                                          */
    /* ------------------------------------------------------------ */

    const vendeurIds = unique(
      Array.from(produitsMap.values()).map((produit) =>
        textOrNull(produit?.vendeur_id)
      )
    )

    const vendeursMap = new Map<string, any>()

    if (vendeurIds.length > 0) {
      try {
        const { data } = await supabaseAdmin
          .from(PROFILES_TABLE)
          .select(
            'id, nom, prenom, telephone, adresse_boutique, latitude, longitude'
          )
          .in('id', vendeurIds)

        for (const vendeur of data ?? []) {
          vendeursMap.set(String(vendeur.id), vendeur)
        }
      } catch {
        try {
          const { data } = await supabaseAdmin
            .from(VENDEURS_TABLE)
            .select(
              'id, nom, prenom, telephone, adresse_boutique, latitude, longitude'
            )
            .in('id', vendeurIds)

          for (const vendeur of data ?? []) {
            vendeursMap.set(String(vendeur.id), vendeur)
          }
        } catch {
          // ignore
        }
      }
    }

    /* ------------------------------------------------------------ */
    /* 9. Normaliser articles                                       */
    /* ------------------------------------------------------------ */

    const articles = rawArticles.map((article, index) => {
      const produitId = textOrNull(article?.produit_id ?? article?.product_id)
      const produit = produitId ? produitsMap.get(produitId) : null
      const vendeurId = textOrNull(produit?.vendeur_id)
      const vendeur = vendeurId ? vendeursMap.get(vendeurId) : null

      return {
        id: String(article?.id || `article-${index}`),
        produit_id: String(produitId || ''),
        nom: String(
          article?.nom ||
            article?.product_name ||
            produit?.nom ||
            `Article ${index + 1}`
        ).trim(),
        quantite: toNum(article?.quantite ?? article?.quantity, 1),
        specifications: textOrNull(article?.specifications ?? article?.specs),
        variante: article?.variante ?? null,
        statut_collecte: normalizeCollectStatus(
          article?.statut_collecte ?? article?.collect_status ?? article?.statut
        ),
        motif_refus: textOrNull(article?.motif_refus ?? article?.refuse_reason),
        photo_preuve: textOrNull(article?.photo_preuve ?? article?.proof_photo),
        produits: {
          id: String(produitId || ''),
          nom: String(produit?.nom || article?.nom || ''),
          images: toStringArray(produit?.images),
        },
        vendeur: vendeur
          ? {
              nom: String(vendeur.nom || vendeur.last_name || '').trim(),
              prenom: String(vendeur.prenom || vendeur.first_name || '').trim(),
              telephone: textOrNull(vendeur.telephone ?? vendeur.phone),
              adresse_boutique: textOrNull(
                vendeur.adresse_boutique ??
                  vendeur.boutique_address ??
                  vendeur.address
              ),
              latitude: toNullableNumber(vendeur.latitude),
              longitude: toNullableNumber(vendeur.longitude),
            }
          : null,
      }
    })

    /* ------------------------------------------------------------ */
    /* 10. Construire réponse                                       */
    /* ------------------------------------------------------------ */

    const normalizedStatut = normalizeStatus(
      livraison?.statut ?? livraison?.status ?? 'en_attente'
    )

    const code_livraison_client = textOrNull(
      livraison?.code_livraison_client ??
        livraison?.code_client ??
        commande?.code_livraison_client ??
        commande?.code_client
    )

    const code_livreur = textOrNull(livraison?.code_livreur)

    const disponible =
      !livraison ||
      ['en_attente', 'annulee'].includes(normalizedStatut)

    const course = {
      id: String(commandeId || livraison?.id || routeId),
      numero: String(
        commande?.numero ||
          commande?.numero_commande ||
          commande?.order_number ||
          commandeId ||
          ''
      ),
      type_livraison: String(
        commande?.type_livraison ??
          commande?.delivery_type ??
          'domicile'
      ).toLowerCase(),
      adresse:
        textOrNull(
          commande?.adresse ??
            commande?.adresse_livraison ??
            commande?.delivery_address ??
            commande?.address
        ) || '',
      point_retrait_nom: textOrNull(
        commande?.point_retrait_nom ??
          commande?.pickup_point_name ??
          commande?.point_retrait?.nom
      ),
      commune:
        textOrNull(commande?.commune ?? commande?.ville ?? commande?.zone) || '',
      code_livraison_client: code_livraison_client || '',
      code_livreur,
      disponible,
      client: {
        nom: String(
          clientProfile?.nom ||
            clientProfile?.last_name ||
            commande?.client_nom ||
            ''
        ).trim(),
        prenom: String(
          clientProfile?.prenom ||
            clientProfile?.first_name ||
            commande?.client_prenom ||
            ''
        ).trim(),
        telephone: textOrNull(
          clientProfile?.telephone ??
            clientProfile?.phone ??
            commande?.client_telephone
        ),
        latitude: toNullableNumber(
          clientProfile?.latitude ??
            commande?.latitude_livraison ??
            commande?.lat
        ),
        longitude: toNullableNumber(
          clientProfile?.longitude ??
            commande?.longitude_livraison ??
            commande?.lng
        ),
      },
      articles,
      livraison: livraison
        ? {
            id: String(livraison.id || ''),
            statut: normalizedStatut,
            tentativas_code: toNum(livraison.tentativas_code, 0),
            created_at: textOrNull(livraison.created_at),
            delivered_at: textOrNull(
              livraison.delivered_at ?? livraison.date_livraison
            ),
            photos_livraison: toStringArray(
              livraison.photos_livraison ?? livraison.delivery_photos
            ),
            signature_client: textOrNull(
              livraison.signature_client ?? livraison.client_signature
            ),
            geoloc:
              livraison.geoloc ??
              (livraison.latitude !== undefined &&
              livraison.longitude !== undefined
                ? {
                    latitude: toNum(livraison.latitude),
                    longitude: toNum(livraison.longitude),
                    accuracy: toNullableNumber(livraison.accuracy),
                  }
                : null),
          }
        : null,
    }

    return { status: 'ok', course }
  } catch (error: any) {
    log.error?.('Crash loadCourse', error)

    return { status: 'error', error }
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  GET                                                            */
/* ═══════════════════════════════════════════════════════════════ */

export async function GET(
  request: Request,
  context: { params: any }
) {
  const auth = await authenticateLivreur()
  if (auth.response) return auth.response

  const routeId = await resolveRouteId(context.params)

  if (!routeId) {
    return NextResponse.json(
      {
        error: 'ID de course invalide.',
        code: 'INVALID_ID',
      },
      { status: 400 }
    )
  }

  const result = await loadCourse(auth.supabaseAdmin!, routeId, auth.livreurId!)

  if (result.status === 'not_found') {
    return NextResponse.json(
      {
        error: 'Course introuvable.',
        code: 'NOT_FOUND',
      },
      { status: 404 }
    )
  }

  if (result.status === 'forbidden') {
    return NextResponse.json(
      {
        error: 'Cette course ne t’est pas assignée.',
        code: 'FORBIDDEN',
      },
      { status: 403 }
    )
  }

  if (result.status === 'error') {
    return NextResponse.json(
      {
        error: 'Erreur serveur lors du chargement de la course.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage(result.error, 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: result.course,
    generated_at: nowIso(),
  })
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST                                                           */
/* ═══════════════════════════════════════════════════════════════ */

const postSchema = z
  .object({
    action: z.string().min(1),
  })
  .passthrough()

export async function POST(
  request: Request,
  context: { params: any }
) {
  const auth = await authenticateLivreur()
  if (auth.response) return auth.response

  const routeId = await resolveRouteId(context.params)

  if (!routeId) {
    return NextResponse.json(
      {
        error: 'ID de course invalide.',
        code: 'INVALID_ID',
      },
      { status: 400 }
    )
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        error: 'Corps de requête JSON invalide.',
        code: 'INVALID_JSON',
      },
      { status: 400 }
    )
  }

  const parsedBody = postSchema.safeParse(body)

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'Action invalide.',
        code: 'VALIDATION_ERROR',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const action = parsedBody.data.action
  const supabaseAdmin = auth.supabaseAdmin!
  const livreurId = auth.livreurId!

  try {
    /* ------------------------------------------------------------ */
    /* ACCEPT                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'accept') {
      const loaded = await loadCourse(supabaseAdmin, routeId, livreurId)

      if (loaded.status !== 'ok') {
        if (loaded.status === 'not_found') {
          return NextResponse.json(
            { error: 'Course introuvable.', code: 'NOT_FOUND' },
            { status: 404 }
          )
        }

        if (loaded.status === 'forbidden') {
          return NextResponse.json(
            {
              error: 'Cette course ne t’est pas assignée.',
              code: 'FORBIDDEN',
            },
            { status: 403 }
          )
        }

        return NextResponse.json(
          {
            error: 'Erreur serveur lors du chargement de la course.',
            code: 'INTERNAL_ERROR',
          },
          { status: 500 }
        )
      }

      const course = loaded.course
      const existingLivraison = course.livraison

      if (
        existingLivraison &&
        !['en_attente', 'annulee'].includes(existingLivraison.statut)
      ) {
        return NextResponse.json({
          success: true,
          message: 'Course déjà acceptée.',
          data: course,
          generated_at: nowIso(),
        })
      }

      const code_livreur =
        course.code_livreur || `LRV-${generateNumericCode(4)}`

      const code_livraison_client =
        course.code_livraison_client || generateAlphaCode(6)

      if (existingLivraison?.id) {
        const { error } = await updateByIdWithFallback(
          supabaseAdmin,
          LIVRAISONS_TABLE,
          existingLivraison.id,
          {
            livreur_id: livreurId,
            statut: 'acceptee',
            code_livreur,
            code_livraison_client,
            updated_at: nowIso(),
          }
        )

        if (error) {
          return NextResponse.json(
            {
              error: 'Impossible d’accepter la course.',
              code: 'UPDATE_FAILED',
              details: errorMessage(error, 'Erreur inconnue'),
            },
            { status: 500 }
          )
        }
      } else {
        const { error } = await insertWithFallback(supabaseAdmin, LIVRAISONS_TABLE, {
          commande_id: course.id,
          livreur_id: livreurId,
          statut: 'acceptee',
          code_livreur,
          code_livraison_client,
          created_at: nowIso(),
          updated_at: nowIso(),
        })

        if (error) {
          return NextResponse.json(
            {
              error:
                'Impossible de créer la livraison. Vérifie que la table public.livraisons existe.',
              code: 'INSERT_FAILED',
              details: errorMessage(error, 'Erreur inconnue'),
            },
            { status: 503 }
          )
        }
      }

      // Best effort : marquer la commande comme assignée
      try {
        await updateByIdWithFallback(supabaseAdmin, COMMANDES_TABLE, course.id, {
          livreur_id: livreurId,
          statut: 'assignee',
          updated_at: nowIso(),
        })
      } catch {
        // ignore
      }

      const refreshed = await loadCourse(supabaseAdmin, routeId, livreurId)

      return NextResponse.json({
        success: true,
        message: 'Course acceptée.',
        data: refreshed.status === 'ok' ? refreshed.course : course,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* VALIDATE ARTICLE                                              */
    /* ------------------------------------------------------------ */

    if (action === 'validate-article') {
      const articleId = textOrNull(body?.article_id)
      const code = textOrNull(body?.code)

      if (!articleId) {
        return NextResponse.json(
          {
            error: 'article_id requis.',
            code: 'MISSING_ARTICLE_ID',
          },
          { status: 400 }
        )
      }

      if (!code || !/^\d{6}$/.test(code)) {
        return NextResponse.json(
          {
            error: 'Code article invalide. 6 chiffres requis.',
            code: 'INVALID_ARTICLE_CODE',
          },
          { status: 400 }
        )
      }

      const loaded = await loadCourse(supabaseAdmin, routeId, livreurId)

      if (loaded.status !== 'ok') {
        return NextResponse.json(
          {
            error:
              loaded.status === 'forbidden'
                ? 'Cette course ne t’est pas assignée.'
                : 'Course introuvable.',
            code: loaded.status === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND',
          },
          { status: loaded.status === 'forbidden' ? 403 : 404 }
        )
      }

      const article = loaded.course.articles.find((a: any) => a.id === articleId)

      if (!article) {
        return NextResponse.json(
          {
            error: 'Article introuvable dans cette course.',
            code: 'ARTICLE_NOT_FOUND',
          },
          { status: 404 }
        )
      }

      // Si une colonne code_article existe, on peut la vérifier.
      try {
        const { data: rawArticle } = await supabaseAdmin
          .from(ARTICLES_TABLE)
          .select('*')
          .eq('id', articleId)
          .maybeSingle()

        const expectedCode = textOrNull(
          rawArticle?.code_article ?? rawArticle?.article_code ?? rawArticle?.code
        )

        if (expectedCode && expectedCode !== code) {
          return NextResponse.json(
            {
              error: 'Code article incorrect.',
              code: 'WRONG_ARTICLE_CODE',
            },
            { status: 400 }
          )
        }
      } catch {
        // si colonne absente, on accepte quand même
      }

      const { error } = await updateByIdWithFallback(
        supabaseAdmin,
        ARTICLES_TABLE,
        articleId,
        {
          statut_collecte: 'accepte',
          updated_at: nowIso(),
        }
      )

      if (error) {
        return NextResponse.json(
          {
            error: 'Impossible de valider l’article.',
            code: 'UPDATE_FAILED',
            details: errorMessage(error, 'Erreur inconnue'),
          },
          { status: 500 }
        )
      }

      // Si tous les articles sont traités, passer la livraison en colis_recupere
      try {
        const { data: remaining } = await supabaseAdmin
          .from(ARTICLES_TABLE)
          .select('id')
          .eq('commande_id', loaded.course.id)
          .not('statut_collecte', 'in', '("accepte","refuse")')
          .limit(1)

        if (!remaining || remaining.length === 0) {
          if (loaded.course.livraison?.id) {
            await updateByIdWithFallback(
              supabaseAdmin,
              LIVRAISONS_TABLE,
              loaded.course.livraison.id,
              {
                statut: 'colis_recupere',
                updated_at: nowIso(),
              }
            )
          }
        }
      } catch {
        // ignore
      }

      const refreshed = await loadCourse(supabaseAdmin, routeId, livreurId)

      return NextResponse.json({
        success: true,
        message: 'Article validé.',
        data: refreshed.status === 'ok' ? refreshed.course : loaded.course,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* REFUSE ARTICLE                                                */
    /* ------------------------------------------------------------ */

    if (action === 'refuse-article') {
      const articleId = textOrNull(body?.article_id)
      const motif = textOrNull(body?.motif)
      const photoPreuve = textOrNull(body?.photo_preuve)

      if (!articleId) {
        return NextResponse.json(
          {
            error: 'article_id requis.',
            code: 'MISSING_ARTICLE_ID',
          },
          { status: 400 }
        )
      }

      if (!motif || motif.trim().length < 3) {
        return NextResponse.json(
          {
            error: 'Motif trop court.',
            code: 'INVALID_MOTIF',
          },
          { status: 400 }
        )
      }

      const loaded = await loadCourse(supabaseAdmin, routeId, livreurId)

      if (loaded.status !== 'ok') {
        return NextResponse.json(
          {
            error:
              loaded.status === 'forbidden'
                ? 'Cette course ne t’est pas assignée.'
                : 'Course introuvable.',
            code: loaded.status === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND',
          },
          { status: loaded.status === 'forbidden' ? 403 : 404 }
        )
      }

      const article = loaded.course.articles.find((a: any) => a.id === articleId)

      if (!article) {
        return NextResponse.json(
          {
            error: 'Article introuvable dans cette course.',
            code: 'ARTICLE_NOT_FOUND',
          },
          { status: 404 }
        )
      }

      const { error } = await updateByIdWithFallback(
        supabaseAdmin,
        ARTICLES_TABLE,
        articleId,
        {
          statut_collecte: 'refuse',
          motif_refus: motif,
          photo_preuve: photoPreuve,
          updated_at: nowIso(),
        }
      )

      if (error) {
        return NextResponse.json(
          {
            error: 'Impossible de refuser l’article.',
            code: 'UPDATE_FAILED',
            details: errorMessage(error, 'Erreur inconnue'),
          },
          { status: 500 }
        )
      }

      try {
        const { data: remaining } = await supabaseAdmin
          .from(ARTICLES_TABLE)
          .select('id')
          .eq('commande_id', loaded.course.id)
          .not('statut_collecte', 'in', '("accepte","refuse")')
          .limit(1)

        if (!remaining || remaining.length === 0) {
          if (loaded.course.livraison?.id) {
            await updateByIdWithFallback(
              supabaseAdmin,
              LIVRAISONS_TABLE,
              loaded.course.livraison.id,
              {
                statut: 'colis_recupere',
                updated_at: nowIso(),
              }
            )
          }
        }
      } catch {
        // ignore
      }

      const refreshed = await loadCourse(supabaseAdmin, routeId, livreurId)

      return NextResponse.json({
        success: true,
        message: 'Article refusé.',
        data: refreshed.status === 'ok' ? refreshed.course : loaded.course,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* DELIVER                                                       */
    /* ------------------------------------------------------------ */

    if (action === 'deliver') {
      const codeClient = textOrNull(body?.code_client)
      const photosLivraison = toStringArray(body?.photos_livraison)
      const signatureClient = textOrNull(body?.signature_client)
      const geoloc = body?.geoloc && typeof body.geoloc === 'object' ? body.geoloc : null

      if (!codeClient || !/^[A-Z0-9]{6}$/i.test(codeClient)) {
        return NextResponse.json(
          {
            error: 'Code client invalide. 6 caractères alphanumériques requis.',
            code: 'INVALID_CLIENT_CODE',
          },
          { status: 400 }
        )
      }

      const loaded = await loadCourse(supabaseAdmin, routeId, livreurId)

      if (loaded.status !== 'ok') {
        return NextResponse.json(
          {
            error:
              loaded.status === 'forbidden'
                ? 'Cette course ne t’est pas assignée.'
                : 'Course introuvable.',
            code: loaded.status === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND',
          },
          { status: loaded.status === 'forbidden' ? 403 : 404 }
        )
      }

      const course = loaded.course

      if (!course.livraison?.id) {
        return NextResponse.json(
          {
            error: 'Aucune livraison associée à cette course.',
            code: 'NO_LIVRAISON',
          },
          { status: 400 }
        )
      }

      if (course.livraison.statut === 'livree') {
        return NextResponse.json({
          success: true,
          message: 'Livraison déjà validée.',
          data: course,
          generated_at: nowIso(),
        })
      }

      const tentativas = toNum(course.livraison.tentativas_code, 0)

      if (tentativas >= MAX_CODE_ATTEMPTS) {
        return NextResponse.json(
          {
            error: 'Nombre maximal de tentatives atteint.',
            code: 'MAX_ATTEMPTS_REACHED',
            tentativas_restantes: 0,
          },
          { status: 400 }
        )
      }

      if (
        course.code_livraison_client &&
        codeClient.toUpperCase() !== course.code_livraison_client.toUpperCase()
      ) {
        const newTentativas = tentativas + 1

        await updateByIdWithFallback(
          supabaseAdmin,
          LIVRAISONS_TABLE,
          course.livraison.id,
          {
            tentativas_code: newTentativas,
            updated_at: nowIso(),
          }
        )

        return NextResponse.json(
          {
            error: 'Le code client ne correspond pas.',
            code: 'WRONG_CLIENT_CODE',
            tentativas_restantes: Math.max(0, MAX_CODE_ATTEMPTS - newTentativas),
          },
          { status: 400 }
        )
      }

      // Vérifier que tous les articles sont traités
      try {
        const { data: remaining } = await supabaseAdmin
          .from(ARTICLES_TABLE)
          .select('id')
          .eq('commande_id', course.id)
          .not('statut_collecte', 'in', '("accepte","refuse")')
          .limit(1)

        if (remaining && remaining.length > 0) {
          return NextResponse.json(
            {
              error:
                'Tous les articles doivent être validés ou refusés avant de livrer.',
              code: 'ARTICLES_NOT_PROCESSED',
            },
            { status: 400 }
          )
        }
      } catch {
        // si table/colonne absente, on continue
      }

      const livraisonPayload: Record<string, unknown> = {
        statut: 'livree',
        delivered_at: nowIso(),
        photos_livraison: photosLivraison,
        signature_client: signatureClient,
        updated_at: nowIso(),
      }

      if (geoloc?.latitude !== undefined && geoloc?.longitude !== undefined) {
        livraisonPayload.latitude = toNum(geoloc.latitude)
        livraisonPayload.longitude = toNum(geoloc.longitude)
        livraisonPayload.accuracy = toNullableNumber(geoloc.accuracy)
      }

      const { error: livraisonError } = await updateByIdWithFallback(
        supabaseAdmin,
        LIVRAISONS_TABLE,
        course.livraison.id,
        livraisonPayload
      )

      if (livraisonError) {
        return NextResponse.json(
          {
            error: 'Impossible de valider la livraison.',
            code: 'UPDATE_FAILED',
            details: errorMessage(livraisonError, 'Erreur inconnue'),
          },
          { status: 500 }
        )
      }

      // Best effort : mettre la commande à jour
      try {
        await updateByIdWithFallback(supabaseAdmin, COMMANDES_TABLE, course.id, {
          statut: 'livree',
          updated_at: nowIso(),
        })
      } catch {
        // ignore
      }

      // Best effort : incrémenter total_livraisons du livreur
      try {
        const { data: livreurRow } = await supabaseAdmin
          .from('livreurs')
          .select('total_livraisons')
        .eq('id', livreurId)
          .maybeSingle()

        const currentTotal = toNum(livreurRow?.total_livraisons, 0)

        await updateByIdWithFallback(supabaseAdmin, 'livreurs', livreurId, {
          total_livraisons: currentTotal + 1,
          derniere_activite: nowIso(),
          updated_at: nowIso(),
        })
      } catch {
        // ignore
      }

      const refreshed = await loadCourse(supabaseAdmin, routeId, livreurId)

      return NextResponse.json({
        success: true,
        message: 'Livraison validée.',
        data: refreshed.status === 'ok' ? refreshed.course : course,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* SIGNAL                                                        */
    /* ------------------------------------------------------------ */

    if (action === 'signal') {
      const type = textOrNull(body?.type) || 'warning'
      const message = textOrNull(body?.message)
      const photo = textOrNull(body?.photo)

      if (!message || message.trim().length < 3) {
        return NextResponse.json(
          {
            error: 'Message trop court.',
            code: 'INVALID_MESSAGE',
          },
          { status: 400 }
        )
      }

      const loaded = await loadCourse(supabaseAdmin, routeId, livreurId)

      if (loaded.status !== 'ok') {
        return NextResponse.json(
          {
            error:
              loaded.status === 'forbidden'
                ? 'Cette course ne t’est pas assignée.'
                : 'Course introuvable.',
            code: loaded.status === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND',
          },
          { status: loaded.status === 'forbidden' ? 403 : 404 }
        )
      }

      const course = loaded.course

      const basePayload = {
        commande_id: course.id,
        livraison_id: course.livraison?.id ?? null,
        livreur_id: livreurId,
        type,
        message,
        photo,
        created_at: nowIso(),
      }

      let inserted = false

      for (const table of SIGNALEMENTS_TABLES) {
        try {
          const payloads = [
            {
              ...basePayload,
              course_id: course.id,
            },
            basePayload,
          ]

          for (const payload of payloads) {
            const { error } = await insertWithFallback(supabaseAdmin, table, payload)

            if (!error) {
              inserted = true
              break
            }

            if (isTableMissingError(error)) {
              break
            }
          }

          if (inserted) break
        } catch {
          // try next table
        }
      }

      if (!inserted) {
        log.warn?.('Signal enregistré sans persistance : aucune table disponible', {
          course: course.id,
          livreurId,
        })
      }

      return NextResponse.json({
        success: true,
        message: inserted
          ? 'Signalement envoyé.'
          : 'Signalement reçu, mais non enregistré en base.',
        persisted: inserted,
        data: course,
        generated_at: nowIso(),
      })
    }

    /* ------------------------------------------------------------ */
    /* ACTION INCONNUE                                               */
    /* ------------------------------------------------------------ */

    return NextResponse.json(
      {
        error: `Action inconnue : ${action}`,
        code: 'UNKNOWN_ACTION',
        supported_actions: [
          'accept',
          'validate-article',
          'refuse-article',
          'deliver',
          'signal',
        ],
      },
      { status: 400 }
    )
  } catch (error: any) {
    log.error?.('Crash POST /api/livreur/courses/[id]', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur interne lors du traitement de la course.',
        code: 'INTERNAL_ERROR',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage(error, 'Erreur inconnue')
            : undefined,
      },
      { status: 500 }
    )
  }
}