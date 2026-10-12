// lib/ai/queryAnalyzer.ts
// Cerveau de la Smart Search : analyse les intentions de l'utilisateur via LLM (Groq)
// avec un fallback heuristique local en cas d'indisponibilité du LLM.
// ---------------------------------------------------------------------------
import { openai } from '@/lib/ai/openaiClient';
import logger from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AnalyzedQuery {
  intents: string[]; // Produits principaux à chercher (ex: ["chaussures élégantes"])
  compatibilityHints: string[]; // Indices de compatibilité (ex: ["chargeur iphone"])
  attributes: {
    colors?: string[];
    events?: string[];
    categories?: string[];
  };
  source: 'llm' | 'heuristic';
}

// ---------------------------------------------------------------------------
// Cache mémoire (TTL 1h)
// ---------------------------------------------------------------------------
const analysisCache = new Map<string, { data: AnalyzedQuery; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

function getCachedAnalysis(key: string): AnalyzedQuery | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedAnalysis(key: string, data: AnalyzedQuery): void {
  // Limitation de la taille du cache pour éviter les fuites mémoire
  if (analysisCache.size >= 500) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) analysisCache.delete(oldestKey);
  }
  analysisCache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Fallback heuristique local
// ---------------------------------------------------------------------------
const BRAND_MODEL_REGEX = /\b(iphone|samsung|galaxy|tecno|infinix|xiaomi|redmi|huawei|itel|oppo|vivo|pixel|oneplus)\b/i;
const ACCESSORY_HINTS = ['chargeur', 'coque', 'verre trempé', 'protection écran', 'écouteurs', 'cable'];

function heuristicFallback(query: string): AnalyzedQuery {
  const cleanQuery = query.trim();
  const match = cleanQuery.match(BRAND_MODEL_REGEX);
  
  const hints: string[] = [];
  if (match) {
    const brandModel = match[0].toLowerCase();
    // On ne garde que les 4 premiers accessoires pour limiter la charge
    hints.push(...ACCESSORY_HINTS.map(acc => `${acc} ${brandModel}`).slice(0, 4));
  }

  return {
    intents: [cleanQuery],
    compatibilityHints: hints,
    attributes: {},
    source: 'heuristic',
  };
}

// ---------------------------------------------------------------------------
// Analyse LLM via Groq
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Tu es un expert en e-commerce à Kinshasa. Ta mission est d'analyser une requête de recherche et d'extraire les intentions d'achat.
Règles strictes :
1. "intents" : Liste des PRODUITS PRINCIPAUX à chercher. Si l'utilisateur dit "chaussures qui vont avec une robe blanche", l'intent est "chaussures élégantes". La robe est le contexte, pas l'intent.
2. "compatibilityHints" : Liste d'accessoires ou produits compatibles UNIQUEMENT si l'utilisateur cite un modèle/marque spécifique (ex: "iphone 17" -> "chargeur iphone", "coque iphone"). Max 4.
3. "attributes" : Extraire les couleurs, événements (mariage, soirée), catégories si mentionnés.
4. Réponds UNIQUEMENT avec un objet JSON valide. Pas de texte avant ou après.`;

async function analyzeWithLLM(query: string): Promise<AnalyzedQuery | null> {
  if (!process.env.GROQ_API_KEY) {
    logger.warn('[QueryAnalyzer] GROQ_API_KEY manquante. Bascule sur fallback heuristique.');
    return null;
  }

  try {
    const completionPromise = openai.chat.completions.create({
      model: process.env.AI_CHAT_MODEL || 'llama-3.1-70b-versatile', // ✅ Modèle Groq actuel et stable
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout LLM (4s)')), 4000)
    );

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    
    let content = completion.choices[0]?.message?.content || '{}';
    // Nettoyage des balises markdown si le LLM en ajoute quand même
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(content);

    return {
      intents: Array.isArray(parsed.intents) ? parsed.intents.slice(0, 4) : [query],
      compatibilityHints: Array.isArray(parsed.compatibilityHints) ? parsed.compatibilityHints.slice(0, 4) : [],
      attributes: {
        colors: Array.isArray(parsed.attributes?.colors) ? parsed.attributes.colors : undefined,
        events: Array.isArray(parsed.attributes?.events) ? parsed.attributes.events : undefined,
        categories: Array.isArray(parsed.attributes?.categories) ? parsed.attributes.categories : undefined,
      },
      source: 'llm',
    };
  } catch (error: any) {
    logger.warn(`[QueryAnalyzer] Échec analyse LLM : ${error.message}. Bascule sur fallback heuristique.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------
/**
 * Analyse une requête de recherche pour extraire les intentions et les indices de compatibilité.
 * Utilise le LLM (Groq) avec un timeout de 4s, et bascule sur une heuristique locale en cas d'échec.
 */
export async function analyzeQuery(query: string): Promise<AnalyzedQuery> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { intents: [], compatibilityHints: [], attributes: {}, source: 'heuristic' };
  }

  // 1. Vérifier le cache
  const cached = getCachedAnalysis(cleanQuery);
  if (cached) {
    logger.debug(`[QueryAnalyzer] Résultat récupéré depuis le cache pour "${cleanQuery}"`);
    return cached;
  }

  // 2. Tenter l'analyse LLM
  const llmResult = await analyzeWithLLM(cleanQuery);
  if (llmResult) {
    setCachedAnalysis(cleanQuery, llmResult);
    logger.info(`[QueryAnalyzer] Analyse LLM réussie pour "${cleanQuery}" | Intents: ${llmResult.intents.join(', ')}`);
    return llmResult;
  }

  // 3. Fallback heuristique
  const heuristicResult = heuristicFallback(cleanQuery);
  setCachedAnalysis(cleanQuery, heuristicResult);
  logger.info(`[QueryAnalyzer] Fallback heuristique utilisé pour "${cleanQuery}" | Hints: ${heuristicResult.compatibilityHints.join(', ')}`);
  return heuristicResult;
}