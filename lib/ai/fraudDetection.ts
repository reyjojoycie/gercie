// lib/ai/fraudDetection.ts
// Service de détection de fraude hybride : règles + IA.
// Retourne un score (0 = sûr, 1 = très suspect) et une liste de flags.
// ---------------------------------------------------------------------------
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logger } from '@/lib/logger';
import { openai } from '@/lib/ai/openaiClient';

// L'IA est activée si la variable d'environnement est à true
const AI_FRAUD_ENABLED = process.env.AI_FRAUD_ENABLED === 'true';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FraudAssessment {
  score: number;        // 0 à 1
  flags: string[];       // descriptions des anomalies
  source: 'rules' | 'ai' | 'hybrid';
}

// ---------------------------------------------------------------------------
// Règles heuristiques (exécutées en local, sans IA)
// ---------------------------------------------------------------------------
interface OrderInfo {
  user_id: string;
  montant_total: number;
  adresse_livraison?: string;
  code_promo_id?: string;
  ip_address?: string;
  created_at: string;
}

async function applyHeuristicRules(orderId: string): Promise<{ score: number; flags: string[] }> {
  const flags: string[] = [];
  let score = 0;

  // 1. Récupérer les infos de la commande
  const { data: order, error: orderError } = await supabaseAdmin
    .from('commandes')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    logger.error(`Commande ${orderId} introuvable`, orderError);
    return { score: 1, flags: ['Commande introuvable'] };
  }

  // 2. Vérifier les commandes multiples récentes du même utilisateur
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentOrdersCount, error: countError } = await supabaseAdmin
    .from('commandes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', order.user_id)
    .gte('created_at', twentyFourHoursAgo);

  if (!countError && recentOrdersCount && recentOrdersCount > 3) {
    flags.push(`Client a passé ${recentOrdersCount} commandes en 24h`);
    score += 0.3;
  }

  // 3. Montant anormalement élevé (ex: > 5000 unités de devise)
  if (order.montant_total > 5000) {
    flags.push('Montant total très élevé');
    score += 0.2;
  }

  // 4. Adresse de livraison suspecte (ex: pays à risque - simplification)
  const riskyZones = ['pays_risque']; // à enrichir
  if (order.adresse_livraison && riskyZones.some(z => order.adresse_livraison.toLowerCase().includes(z))) {
    flags.push('Zone de livraison à risque');
    score += 0.3;
  }

  // 5. Utilisation abusive de codes promo
  if (order.code_promo_id) {
    const { count: promoUsageCount, error: promoError } = await supabaseAdmin
      .from('utilisations_codes_promo')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', order.user_id)
      .eq('code_promo_id', order.code_promo_id);

    if (!promoError && promoUsageCount && promoUsageCount > 3) {
      flags.push(`Code promo utilisé ${promoUsageCount} fois par ce client`);
      score += 0.2;
    }
  }

  // 6. Adresse IP récurrente sur plusieurs comptes (simplifié)
  if (order.ip_address) {
    const { data: ipUsers, error: ipError } = await supabaseAdmin
      .from('commandes')
      .select('user_id')
      .eq('ip_address', order.ip_address)
      .neq('user_id', order.user_id)
      .gte('created_at', twentyFourHoursAgo)
      .limit(5);

    if (!ipError && ipUsers && ipUsers.length > 0) {
      const distinctUsers = new Set(ipUsers.map(u => u.user_id));
      if (distinctUsers.size >= 3) {
        flags.push(`IP partagée entre ${distinctUsers.size} comptes différents`);
        score += 0.3;
      }
    }
  }

  // Limiter le score à 1
  return { score: Math.min(score, 1), flags };
}

// ---------------------------------------------------------------------------
// Évaluation IA via Groq (compatible OpenAI)
// ---------------------------------------------------------------------------
async function aiFraudAnalysis(orderId: string): Promise<{ score: number; flags: string[] } | null> {
  if (!AI_FRAUD_ENABLED) return null;

  try {
    // Récupérer les détails de la commande et un résumé du compte utilisateur
    const { data: order, error: orderError } = await supabaseAdmin
      .from('commandes')
      .select('*, utilisateurs(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return null;

    const prompt = `
Tu es un expert en détection de fraude e-commerce. Analyse cette commande et donne un score de risque entre 0 (aucun risque) et 1 (fraude certaine). 
Retourne UNIQUEMENT un JSON valide de la forme : {"score": 0.0, "flags": ["raison1", "raison2"]}

Détails de la commande :
- ID commande : ${order.id}
- Utilisateur : ${order.utilisateurs?.email || 'inconnu'} (ID: ${order.user_id})
- Montant : ${order.montant_total}
- Date : ${order.created_at}
- Adresse IP : ${order.ip_address || 'inconnue'}
- Code promo utilisé : ${order.code_promo_id ? 'Oui' : 'Non'}
`;

    // Utilise le client Groq partagé, compatible avec l'API OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.AI_CHAT_MODEL || 'llama3-70b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 150,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    // Extraire le JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.min(Math.max(parsed.score || 0, 0), 1),
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    };
  } catch (error) {
    logger.error('Erreur AI fraud detection', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fonction principale combinée
// ---------------------------------------------------------------------------

/**
 * Calcule le score de fraude pour une commande.
 * Combine les règles heuristiques et l'analyse IA (si activée).
 *
 * @param orderId - UUID de la commande
 * @returns FraudAssessment avec score (0-1) et flags explicatifs
 */
export async function calculateFraudScore(orderId: string): Promise<FraudAssessment> {
  // Analyse heuristique toujours exécutée (gratuite, locale)
  const ruleResult = await applyHeuristicRules(orderId);

  // Analyse IA en complément si activée
  if (AI_FRAUD_ENABLED) {
    const aiResult = await aiFraudAnalysis(orderId);
    if (aiResult) {
      // Fusion : moyenne pondérée (règles 0.4, IA 0.6) ou max
      const combinedScore = Math.max(ruleResult.score, aiResult.score); // approche conservatrice
      const allFlags = [...new Set([...ruleResult.flags, ...aiResult.flags])];
      return {
        score: Math.min(combinedScore, 1),
        flags: allFlags,
        source: 'hybrid',
      };
    }
  }

  // Fallback vers règles uniquement
  return {
    score: ruleResult.score,
    flags: ruleResult.flags,
    source: 'rules',
  };
}