// lib/ai/priceOptimizer.ts
// Optimisation tarifaire – combine historique de ventes, prix passés et IA
// pour suggérer un prix de vente optimal. Utilisé par l'admin (suggestion).
// ---------------------------------------------------------------------------
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logger } from '@/lib/logger';
import { openai } from '@/lib/ai/openaiClient';

// L'IA est activée si la variable d'environnement est à true
const AI_PRICE_OPTIMIZER_ENABLED = process.env.AI_PRICE_OPTIMIZER_ENABLED === 'true';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PriceSuggestion {
  suggestedPrice: number;
  confidence: number;      // 0 à 1
  reasoning: string;
  source: 'historical' | 'ai' | 'hybrid';
}

interface PriceRecord {
  prix: number;
  date: string;
  quantite_vendue?: number;
}

// ---------------------------------------------------------------------------
// Analyse historique (locale, sans IA)
// ---------------------------------------------------------------------------
async function analyzeHistoricalData(productId: string): Promise<PriceSuggestion | null> {
  try {
    // 1. Récupérer l'historique des prix
    const { data: priceHistory, error: priceError } = await supabaseAdmin
      .from('historique_prix')
      .select('prix, date_modification')
      .eq('produit_id', productId)
      .order('date_modification', { ascending: false })
      .limit(20);

    if (priceError || !priceHistory || priceHistory.length === 0) {
      return null;
    }

    // 2. Récupérer les ventes associées à ces périodes (via commande_articles)
    const { data: salesData, error: salesError } = await supabaseAdmin
      .from('commande_articles')
      .select('quantite, commandes(created_at)')
      .eq('produit_id', productId)
      .gte('commandes.created_at', priceHistory[priceHistory.length - 1].date_modification)
      .order('commandes(created_at)', { ascending: false })
      .limit(100);

    const totalSold = salesData?.reduce((sum, row) => sum + (row.quantite || 0), 0) || 0;

    const latestPrice = priceHistory[0].prix;
    const avgPrice = priceHistory.reduce((s, p) => s + p.prix, 0) / priceHistory.length;

    const trend = priceHistory.length >= 2 
      ? (priceHistory[0].prix - priceHistory[1].prix) / priceHistory[1].prix 
      : 0;

    let suggestedPrice = avgPrice;
    let confidence = 0.5;
    let reasoning = `Prix moyen sur ${priceHistory.length} changements : ${avgPrice.toFixed(2)}`;

    if (totalSold > 10) {
      suggestedPrice = latestPrice * 1.05;
      confidence = 0.7;
      reasoning = `Forte demande détectée (${totalSold} ventes). Prix actuel ${latestPrice}, suggestion d'augmentation de 5%.`;
    } else if (trend < -0.05) {
      suggestedPrice = latestPrice * 0.95;
      confidence = 0.6;
      reasoning = `Tendance baissière détectée (${(trend * 100).toFixed(1)}%). Prix actuel ${latestPrice}, suggestion de baisse.`;
    }

    return {
      suggestedPrice: Math.round(suggestedPrice * 100) / 100,
      confidence,
      reasoning,
      source: 'historical',
    };
  } catch (error) {
    logger.error(`Erreur analyse historique prix pour ${productId}`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Analyse IA via Groq (compatible OpenAI)
// ---------------------------------------------------------------------------
async function aiPriceAnalysis(productId: string): Promise<PriceSuggestion | null> {
  if (!AI_PRICE_OPTIMIZER_ENABLED) return null;

  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from('produits')
      .select('nom, description, prix, devise, categorie_id')
      .eq('id', productId)
      .single();

    if (productError || !product) return null;

    const { data: prices } = await supabaseAdmin
      .from('historique_prix')
      .select('prix, date_modification')
      .eq('produit_id', productId)
      .order('date_modification', { ascending: false })
      .limit(10);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sales } = await supabaseAdmin
      .from('commande_articles')
      .select('quantite, commandes(created_at)')
      .eq('produit_id', productId)
      .gte('commandes.created_at', thirtyDaysAgo);

    const totalSold = sales?.reduce((sum, r) => sum + (r.quantite || 0), 0) || 0;

    const priceHistoryStr = prices
      ?.map((p) => `${p.date_modification}: ${p.prix}`)
      .join('\n') || 'Aucun historique';

    const prompt = `
Tu es un expert en tarification e-commerce pour Gercie, une plateforme premium.
Analyse le produit suivant et suggère un prix optimal (en devise locale) basé sur son historique et les ventes récentes.
Donne UNIQUEMENT une réponse JSON de la forme : {"suggestedPrice": 0.0, "confidence": 0.0, "reasoning": "explication courte"}

Produit : ${product.nom}
Catégorie : ${product.categorie_id || 'Non spécifiée'}
Prix actuel : ${product.prix} ${product.devise || ''}
Description : ${product.description?.slice(0, 200) || ''}

Historique des prix récents :
${priceHistoryStr}

Ventes des 30 derniers jours : ${totalSold} unités

Prends en compte la saisonnalité (mois de juin), la concurrence probable et la demande.`;
    
    const completion = await openai.chat.completions.create({
      model: process.env.AI_CHAT_MODEL || 'llama3-70b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 200,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      suggestedPrice: Math.round(parseFloat(parsed.suggestedPrice) * 100) / 100 || product.prix,
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      reasoning: parsed.reasoning || 'Analyse IA',
      source: 'ai',
    };
  } catch (error) {
    logger.error(`Erreur IA price optimizer pour ${productId}`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fonction principale (combinée)
// ---------------------------------------------------------------------------
export async function suggestOptimalPrice(productId: string): Promise<PriceSuggestion> {
  const historical = await analyzeHistoricalData(productId);

  if (AI_PRICE_OPTIMIZER_ENABLED) {
    const ai = await aiPriceAnalysis(productId);
    if (ai && historical) {
      const combinedPrice = historical.suggestedPrice * 0.6 + ai.suggestedPrice * 0.4;
      const combinedConfidence = Math.max(historical.confidence, ai.confidence);
      return {
        suggestedPrice: Math.round(combinedPrice * 100) / 100,
        confidence: combinedConfidence,
        reasoning: `Hybride: (${historical.reasoning}) et IA: ${ai.reasoning}`,
        source: 'hybrid',
      };
    } else if (ai) {
      return ai;
    }
  }

  if (historical) return historical;

  const { data: product } = await supabaseAdmin
    .from('produits')
    .select('prix')
    .eq('id', productId)
    .single();

  return {
    suggestedPrice: product?.prix || 0,
    confidence: 0.1,
    reasoning: 'Aucune donnée historique disponible – prix actuel renvoyé.',
    source: 'historical',
  };
}