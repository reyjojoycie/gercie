// lib/anti-fraude.ts
/**
 * Système anti-fraude Gercie.
 * Combine des règles métier (tentatives de validation, rate limiting)
 * avec l’analyse IA (score de risque commande) pour une protection complète.
 */
import { createClient } from '@/lib/supabaseServer'
import type { SupabaseClient } from '@supabase/supabase-js'
import logger from '@/lib/logger'
import { calculateFraudScore, type FraudAssessment } from '@/lib/ai/fraudDetection'

/* ------------------------------------------------------------------ */
/*  Configuration                                                        */
/* ------------------------------------------------------------------ */
const MAX_FAILED_ATTEMPTS = 3          // échecs avant blocage
const ATTEMPT_WINDOW_MINUTES = 15      // fenêtre de comptage des échecs
const RATE_LIMIT_MAX_ATTEMPTS = 5      // tentatives max (succès+échecs) en fenêtre courte
const RATE_LIMIT_WINDOW_MINUTES = 5    // fenêtre courte

/* ------------------------------------------------------------------ */
/*  Enregistrement d'une tentative                                       */
/* ------------------------------------------------------------------ */
/**
 * Enregistre une tentative de validation dans validation_codes.
 * @returns l'ID de l'enregistrement créé (ou null)
 */
export async function recordAttempt(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  codeSaisi: string,
  valide: boolean,
  utilisateurId?: string,
  utilisateurType?: 'ADMIN' | 'LIVREUR' | 'SYSTEM',
  ip?: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('validation_codes')
      .insert({
        commande_id: commandeId,
        type_code: typeCode,
        code_saisi: codeSaisi,
        valide,
        utilisateur_id: utilisateurId || null,
        utilisateur_type: utilisateurType || 'SYSTEM',
        adresse_ip: ip || null,
      })
      .select('id')
      .single()

    if (error) {
      logger.error(`Erreur enregistrement tentative validation ${typeCode} commande ${commandeId}`, error)
      return null
    }
    return data.id
  } catch (err: any) {
    logger.error('Crash recordAttempt', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Vérification de code déjà utilisé (succès antérieur)                 */
/* ------------------------------------------------------------------ */
/**
 * Vérifie si un code a déjà été validé avec succès pour cette commande.
 */
export async function isCodeAlreadyUsed(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('validation_codes')
      .select('id')
      .eq('commande_id', commandeId)
      .eq('type_code', typeCode)
      .eq('valide', true)
      .maybeSingle()

    if (error) {
      logger.error(`Erreur vérification code déjà utilisé ${typeCode} commande ${commandeId}`, error)
      return false
    }
    return !!data
  } catch (err: any) {
    logger.error('Crash isCodeAlreadyUsed', err)
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Comptage des tentatives échouées récentes                             */
/* ------------------------------------------------------------------ */
/**
 * Compte les échecs dans une fenêtre de temps donnée.
 */
export async function countRecentFailures(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  windowMinutes: number = ATTEMPT_WINDOW_MINUTES,
): Promise<number> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('validation_codes')
      .select('*', { count: 'exact', head: true })
      .eq('commande_id', commandeId)
      .eq('type_code', typeCode)
      .eq('valide', false)
      .gte('cree_le', since)

    if (error) {
      logger.error(`Erreur comptage échecs ${typeCode} commande ${commandeId}`, error)
      return 0
    }
    return count ?? 0
  } catch (err: any) {
    logger.error('Crash countRecentFailures', err)
    return 0
  }
}

/* ------------------------------------------------------------------ */
/*  Blocage après trop d’échecs                                          */
/* ------------------------------------------------------------------ */
/**
 * Indique si le code est temporairement bloqué suite à trop d'échecs.
 */
export async function isCodeBlocked(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  maxAttempts: number = MAX_FAILED_ATTEMPTS,
): Promise<boolean> {
  const failures = await countRecentFailures(supabase, commandeId, typeCode)
  return failures >= maxAttempts
}

/* ------------------------------------------------------------------ */
/*  Rate limiting par commande (brute force)                             */
/* ------------------------------------------------------------------ */
/**
 * Vérifie si trop de tentatives (succès+échecs) ont été faites récemment.
 */
export async function isRateLimited(
  supabase: SupabaseClient,
  commandeId: string,
  typeCode: 'CLIENT' | 'LIVREUR',
  maxAttempts: number = RATE_LIMIT_MAX_ATTEMPTS,
  windowMinutes: number = RATE_LIMIT_WINDOW_MINUTES,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('validation_codes')
      .select('*', { count: 'exact', head: true })
      .eq('commande_id', commandeId)
      .eq('type_code', typeCode)
      .gte('cree_le', since)

    if (error) {
      logger.error(`Erreur rate limit check ${typeCode} commande ${commandeId}`, error)
      return false
    }
    return (count ?? 0) >= maxAttempts
  } catch (err: any) {
    logger.error('Crash isRateLimited', err)
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Détection d'activité suspecte (pour les admins)                      */
/* ------------------------------------------------------------------ */
/**
 * Retourne les commandes avec plus de N échecs récents.
 */
export async function getSuspiciousActivity(
  supabase: SupabaseClient,
  minFailures: number = 2,
  windowMinutes: number = 60,
): Promise<{ commande_id: string; failures: number }[]> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('validation_codes')
      .select('commande_id, valide')
      .eq('valide', false)
      .gte('cree_le', since)
      .order('commande_id')

    if (error) {
      logger.error('Erreur récupération activité suspecte', error)
      return []
    }

    const countMap = new Map<string, number>()
    for (const row of data || []) {
      countMap.set(row.commande_id, (countMap.get(row.commande_id) || 0) + 1)
    }
    return Array.from(countMap.entries())
      .filter(([_, count]) => count >= minFailures)
      .map(([commande_id, failures]) => ({ commande_id, failures }))
  } catch (err: any) {
    logger.error('Crash getSuspiciousActivity', err)
    return []
  }
}

/* ========================================================================== */
/*  ** NOUVELLES FONCTIONS – Intégration IA **                                */
/* ========================================================================== */

/**
 * Évalue le risque global d’une commande en combinant les indicateurs
 * de validation (tentatives, blocages) et le score IA.
 *
 * @param orderId - ID de la commande
 * @returns Une évaluation détaillée du risque
 */
export async function getOrderFraudRisk(
  orderId: string,
  ip?: string
): Promise<{
  aiAssessment: FraudAssessment
  validationFlags: {
    clientBlocked: boolean
    livreurBlocked: boolean
    clientFailures: number
    livreurFailures: number
  }
  overallRisk: 'low' | 'medium' | 'high'
}> {
  const supabase = await createClient(true)

  // Récupération des indicateurs de validation (existants)
  const [clientBlocked, livreurBlocked, clientFailures, livreurFailures] = await Promise.all([
    isCodeBlocked(supabase, orderId, 'CLIENT'),
    isCodeBlocked(supabase, orderId, 'LIVREUR'),
    countRecentFailures(supabase, orderId, 'CLIENT'),
    countRecentFailures(supabase, orderId, 'LIVREUR'),
  ])

  // Score IA (si disponible)
  let aiAssessment: FraudAssessment = {
    score: 0,
    flags: [],
    source: 'rules',
  }
  try {
    aiAssessment = await calculateFraudScore(orderId)
  } catch (error) {
    logger.warn(`Impossible d’obtenir le score IA pour la commande ${orderId}, utilisation du mode règles uniquement.`)
  }

  // Calcul du risque combiné
  const validationRisk = (clientBlocked || livreurBlocked) ? 0.5 : (clientFailures + livreurFailures) * 0.1
  const combinedScore = Math.min(aiAssessment.score + validationRisk, 1)

  let overallRisk: 'low' | 'medium' | 'high'
  if (combinedScore > 0.7) overallRisk = 'high'
  else if (combinedScore > 0.4) overallRisk = 'medium'
  else overallRisk = 'low'

  return {
    aiAssessment,
    validationFlags: {
      clientBlocked,
      livreurBlocked,
      clientFailures,
      livreurFailures,
    },
    overallRisk,
  }
}

/**
 * Récupère les commandes suspectes selon les règles et leur score IA,
 * pour un tableau de bord admin enrichi.
 */
export async function getSuspiciousOrdersWithAIScore(
  minFailures: number = 2,
  windowMinutes: number = 60
): Promise<Array<{
  commande_id: string
  failures: number
  aiScore?: number
  aiFlags: string[]
}>> {
  const supabase = await createClient(true)
  const suspicious = await getSuspiciousActivity(supabase, minFailures, windowMinutes)

  // Enrichir avec le score IA (parallélisé, avec fallback)
  const enriched = await Promise.all(
    suspicious.map(async ({ commande_id, failures }) => {
      try {
        const ai = await calculateFraudScore(commande_id)
        return { commande_id, failures, aiScore: ai.score, aiFlags: ai.flags }
      } catch {
        return { commande_id, failures, aiScore: undefined, aiFlags: [] }
      }
    })
  )

  // Trier par risque décroissant (échecs + score IA)
  return enriched.sort((a, b) => {
    const riskA = a.failures * 0.1 + (a.aiScore || 0)
    const riskB = b.failures * 0.1 + (b.aiScore || 0)
    return riskB - riskA
  })
}