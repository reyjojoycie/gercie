// lib/ai/contentGenerator.ts
// Génération de contenu IA – descriptions, alt-text, méta SEO, traductions.
// Appelle l'API Groq via le client partagé (gratuit) et intègre un cache mémoire basique.
// ---------------------------------------------------------------------------
import { openai } from '@/lib/ai/openaiClient';
import { logger } from '@/lib/logger';

// Modèle utilisé pour la génération de texte
const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'llama3-70b-8192';

// Cache mémoire simple pour les résultats (clé = hash du prompt)
const cache = new Map<string, string>();
const CACHE_MAX_SIZE = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface GenerationOptions {
  temperature?: number;   // entre 0 et 1 (défaut 0.7)
  maxTokens?: number;     // défaut 200
  language?: string;      // langue cible pour les traductions (ex: 'en', 'fr')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildCacheKey(prompt: string, options: GenerationOptions = {}): string {
  return `${prompt}|${JSON.stringify(options)}`;
}

function setCache(key: string, value: string) {
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

// ---------------------------------------------------------------------------
// Fonctions publiques
// ---------------------------------------------------------------------------

/**
 * Génère une description de produit attrayante pour la vitrine.
 */
export async function generateProductDescription(
  productName: string,
  category?: string,
  attributes?: string
): Promise<string> {
  const prompt = `Rédige une description commerciale attrayante pour un produit e-commerce (3-4 phrases) en français.
Produit : ${productName}
${category ? `Catégorie : ${category}` : ''}
${attributes ? `Caractéristiques principales : ${attributes}` : ''}
Sois concis, persuasif et mets en avant les bénéfices.`;

  const cacheKey = buildCacheKey(prompt, { temperature: 0.7, maxTokens: 200 });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    setCache(cacheKey, text);
    return text;
  } catch (error: any) {
    logger.error('Erreur generateProductDescription', error);
    throw new Error(`Impossible de générer la description : ${error.message}`);
  }
}

/**
 * Génère un texte alternatif (alt) pour une image produit.
 */
export async function generateProductAltText(
  productName: string,
  imageContext?: string
): Promise<string> {
  const prompt = `Rédige un texte alternatif (alt) pour une image de produit e-commerce.
Produit : ${productName}
${imageContext ? `Contexte de l'image : ${imageContext}` : ''}
Limite toi à une phrase descriptive, incluant le nom du produit, en français.`;

  const cacheKey = buildCacheKey(prompt, { temperature: 0.5, maxTokens: 60 });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 60,
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    setCache(cacheKey, text);
    return text;
  } catch (error: any) {
    logger.error('Erreur generateProductAltText', error);
    throw new Error(`Impossible de générer l'alt text : ${error.message}`);
  }
}

/**
 * Génère une balise meta description SEO pour une page produit.
 */
export async function generateSEOMetaDescription(
  productName: string,
  productDescription: string
): Promise<string> {
  const prompt = `Rédige une meta description SEO (max 160 caractères) en français pour la page produit suivante :
Produit : ${productName}
Description : ${productDescription}
Sois attractif et contiens le nom du produit.`;

  const cacheKey = buildCacheKey(prompt, { temperature: 0.5, maxTokens: 100 });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 100,
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    setCache(cacheKey, text);
    return text.slice(0, 160);
  } catch (error: any) {
    logger.error('Erreur generateSEOMetaDescription', error);
    throw new Error(`Impossible de générer la meta description : ${error.message}`);
  }
}

/**
 * Traduit un texte vers une langue cible.
 */
export async function translateText(
  text: string,
  targetLanguage: string
): Promise<string> {
  const languageNames: Record<string, string> = {
    en: 'Anglais',
    fr: 'Français',
    ar: 'Arabe',
    sw: 'Swahili',
    es: 'Espagnol',
  };
  const langName = languageNames[targetLanguage] || targetLanguage;

  const prompt = `Traduis le texte suivant en ${langName} (langue : ${targetLanguage}). Conserve le ton et le format. Ne donne que la traduction, sans commentaire.
Texte : "${text}"`;

  const cacheKey = buildCacheKey(prompt, { temperature: 0.3, maxTokens: text.length * 2 });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: Math.min(text.length * 2, 1000),
    });
    const translation = completion.choices[0]?.message?.content?.trim() || text;
    setCache(cacheKey, translation);
    return translation;
  } catch (error: any) {
    logger.error('Erreur translateText', error);
    throw new Error(`Impossible de traduire le texte : ${error.message}`);
  }
}