// app/api/admin/retraits/route.ts
/**
 * API de gestion des demandes de retrait – version premium.
 *
 * Enrichissements :
 *  - Validation Zod pour GET et PUT
 *  - Rate limiting
 *  - Cache mémoire pour le GET
 *  - Pagination améliorée avec compteurs de statuts
 *  - Traitement par lot (bulk approve/reject)
 *  - Remboursement sécurisé avec rollback
 *  - Notifications enrichies (email, push, SMS)
 *  - Logs structurés
 *  - Gestion des erreurs avancée
 */
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { sendEmail, sendSMS, createNotification } from '@/lib/notifications'

/* ========================================================================== */
/*  Schémas de validation                                                     */
/* ========================================================================== */

// ✅ Ajout de 'date' comme alias de created_at
const getQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('all'),
  search: z.string().optional().default(''),
  sort_by: z.enum(['created_at', 'montant', 'date']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
})

const traitementSchema = z.object({
  retraitIds: z.array(z.string().uuid()).min(1, 'Au moins un ID requis'),
  action: z.enum(['approved', 'rejected']),
  commentaire: z.string().max(500).optional(),
})

/* ========================================================================== */
/*  Cache simple                                                               */
/* ========================================================================== */
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30_000

function getCache(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/* ========================================================================== */
/*  GET – Liste des demandes de retrait                                        */
/* ========================================================================== */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-retraits:${ip}`,
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

  const { searchParams } = new URL(request.url)
  const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { status, search, sort_by, sort_order, page, limit } = parsed.data
  const offset = (page - 1) * limit
  // ✅ Mappe 'date' vers 'created_at'
  const sortColumn = sort_by === 'date' ? 'created_at' : sort_by

  const cacheKey = `admin-retraits:${JSON.stringify(parsed.data)}`
  const cached = getCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const supabase = await createClient(true)

    // Recherche préalable des utilisateurs si "search" est fourni
    let matchingUserIds: string[] | null = null
    if (search) {
      const term = `%${search}%`
      const { data: matchedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`email.ilike.${term},nom.ilike.${term},prenom.ilike.${term}`)

      if (matchedProfiles) {
        matchingUserIds = matchedProfiles.map(p => p.id)
        if (matchingUserIds.length === 0) {
          return NextResponse.json({
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
            stats: { pending: 0, approved: 0, rejected: 0 },
          })
        }
      }
    }

    // Construire la requête principale
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('type', 'retrait')

    if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (matchingUserIds) {
      query = query.in('user_id', matchingUserIds)
    }

    // Compteurs par statut (avant pagination)
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'retrait').eq('status', 'pending'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'retrait').eq('status', 'approved'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'retrait').eq('status', 'rejected'),
    ])

    // Tri et pagination
    const ascending = sort_order === 'asc'
    if (sortColumn === 'montant') {
      query = query.order('montant', { ascending })
    } else {
      query = query.order('created_at', { ascending })
    }
    query = query.range(offset, offset + limit - 1)

    const { data: transactions, error, count } = await query
    if (error) {
      logger.error(error, 'Erreur récupération retraits')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Récupérer les profils associés
    const userIds = transactions?.map(t => t.user_id) ?? []
    let profilesMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, email, nom, prenom, telephone')
        .in('id', userIds)
      if (profilesData) {
        profilesMap = profilesData.reduce((acc, p) => {
          acc[p.id] = p
          return acc
        }, {} as Record<string, any>)
      }
    }

    const formatted = (transactions || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      montant: Math.abs(r.montant),
      description: r.description,
      date: r.created_at,
      status: r.status,
      commentaire: r.metadata?.commentaire || null,
      utilisateur: profilesMap[r.user_id]
        ? {
            email: profilesMap[r.user_id].email,
            nom: profilesMap[r.user_id].nom,
            prenom: profilesMap[r.user_id].prenom,
            telephone: profilesMap[r.user_id].telephone,
          }
        : null,
    }))

    const response = {
      data: formatted,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      stats: {
        pending: pendingCount.count ?? 0,
        approved: approvedCount.count ?? 0,
        rejected: rejectedCount.count ?? 0,
      },
    }

    setCache(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(error, 'Crash GET admin/retraits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  PUT – Traiter une ou plusieurs demandes (approuver / rejeter)             */
/* ========================================================================== */
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-retraits-put:${ip}`,
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

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = traitementSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { retraitIds, action, commentaire } = parsed.data

  try {
    const supabase = await createClient(true)
    const results = { approved: 0, rejected: 0, failed: 0 }

    for (const retraitId of retraitIds) {
      try {
        // Récupérer la transaction
        const { data: retrait, error: fetchError } = await supabase
          .from('transactions')
          .select('id, user_id, montant, status, metadata')
          .eq('id', retraitId)
          .eq('type', 'retrait')
          .single()

        if (fetchError || !retrait) {
          results.failed++
          continue
        }

        if (retrait.status !== 'pending') {
          results.failed++
          continue
        }

        const montantPositif = Math.abs(retrait.montant)

        // Récupérer les infos de l'utilisateur
        const { data: utilisateur } = await supabase
          .from('profiles')
          .select('id, email, telephone')
          .eq('id', retrait.user_id)
          .single()

        if (action === 'approved') {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'approved' })
            .eq('id', retraitId)

          if (updateError) {
            results.failed++
            continue
          }

          results.approved++

          if (utilisateur) {
            await sendEmail(
              utilisateur.email,
              'Retrait approuvé – Gercie',
              `<p>Votre retrait de <strong>${montantPositif.toLocaleString()} FC</strong> a été approuvé.</p>`
            )
            await createNotification(
              retrait.user_id,
              'retrait',
              'Retrait approuvé',
              `Votre retrait de ${montantPositif.toLocaleString()} FC a été approuvé.`,
              { transaction_id: retraitId }
            )
            if (utilisateur.telephone) {
              await sendSMS(
                utilisateur.telephone,
                `Gercie: Votre retrait de ${montantPositif.toLocaleString()} FC a été approuvé.`
              )
            }
          }
        } else if (action === 'rejected') {
          // Rembourser le portefeuille vente avec gestion d'erreur et rollback
          let walletRestored = false
          try {
            const { data: wallet } = await supabase
              .from('portefeuilles')
              .select('solde_vente')
              .eq('id', retrait.user_id)
              .single()

            if (wallet) {
              const nouveauSolde = wallet.solde_vente + montantPositif
              const { error: updateWalletError } = await supabase
                .from('portefeuilles')
                .update({ solde_vente: nouveauSolde })
                .eq('id', retrait.user_id)

              if (!updateWalletError) {
                // Enregistrer la transaction de remboursement
                await supabase.from('transactions').insert({
                  user_id: retrait.user_id,
                  type: 'remboursement',
                  montant: montantPositif,
                  description: `Remboursement retrait refusé #${retraitId}`,
                  status: 'approved',
                  portefeuille_type: 'vente',
                  created_at: new Date().toISOString(),
                })
                walletRestored = true
              }
            }
          } catch (walletError) {
            logger.error(walletError, `Erreur remboursement portefeuille retrait ${retraitId}`)
          }

          // Mise à jour du statut
          const updateData: any = { status: 'rejected' }
          if (commentaire) {
            updateData.metadata = { ...retrait.metadata, commentaire }
          }
          const { error: updateError } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', retraitId)

          if (updateError) {
            // Tenter de rollback le portefeuille si on l'avait restauré
            if (walletRestored) {
              try {
                const { data: wallet } = await supabase
                  .from('portefeuilles')
                  .select('solde_vente')
                  .eq('id', retrait.user_id)
                  .single()
                if (wallet) {
                  await supabase
                    .from('portefeuilles')
                    .update({ solde_vente: wallet.solde_vente - montantPositif })
                    .eq('id', retrait.user_id)
                }
              } catch (rollbackErr) {
                logger.error(rollbackErr, `Rollback échoué pour le retrait ${retraitId}`)
              }
            }
            results.failed++
            continue
          }

          results.rejected++

          if (utilisateur) {
            const motifMsg = commentaire ? ` Motif : ${commentaire}.` : ''
            await sendEmail(
              utilisateur.email,
              'Retrait refusé – Gercie',
              `<p>Votre retrait de <strong>${montantPositif.toLocaleString()} FC</strong> a été refusé. Le montant a été recrédité.${motifMsg}</p>`
            )
            await createNotification(
              retrait.user_id,
              'retrait',
              'Retrait refusé',
              `Votre retrait de ${montantPositif.toLocaleString()} FC a été refusé. Le montant a été recrédité.${motifMsg}`,
              { transaction_id: retraitId }
            )
            if (utilisateur.telephone) {
              await sendSMS(
                utilisateur.telephone,
                `Gercie: Votre retrait de ${montantPositif.toLocaleString()} FC a été refusé. Montant recrédité.`
              )
            }
          }
        }
      } catch (itemError) {
        logger.error(itemError, `Erreur traitement retrait ${retraitId}`)
        results.failed++
      }
    }

    // Invalider le cache
    cache.clear()

    logger.info(`Retraits traités : ${results.approved} approuvés, ${results.rejected} rejetés, ${results.failed} échoués`, {
      retraitIds,
      action,
    })

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (error: any) {
    logger.error(error, 'Crash PUT admin/retraits')
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}