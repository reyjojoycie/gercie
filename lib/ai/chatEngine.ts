// lib/ai/chatEngine.ts
// Service de chatbot RAG – combine recherche sémantique et LLM pour répondre
// aux questions des utilisateurs sur les produits et services Gercie.
// ---------------------------------------------------------------------------
import { openai } from '@/lib/ai/openaiClient';
import { hybridSearch } from './semanticSearch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import logger from '@/lib/logger';

const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'llama-3.1-70b-versatile'; // ✅ Modèle Groq actuel et stable

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  /** Historique de la conversation (sans le message actuel). */
  history?: ChatMessage[];
  /** ID utilisateur pour personnalisation (optionnel). */
  userId?: string;
  /** Nombre maximal de produits à injecter comme contexte. */
  productLimit?: number;
  /** Température du modèle (0 = précis, 1 = créatif). */
  temperature?: number;
}

// ---------------------------------------------------------------------------
// Récupération des détails produits
// ---------------------------------------------------------------------------
interface ProductSnippet {
  id: string;
  nom: string;
  description: string;
  prix: number;
  devise: string;
}

async function fetchProductDetails(productIds: string[]): Promise<ProductSnippet[]> {
  if (!productIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from('produits')
    .select('id, nom, description, prix, devise')
    .in('id', productIds)
    .limit(10); // Garder la réponse concise

  if (error) {
    logger.error('Erreur fetchProductDetails', error);
    return [];
  }
  return (data ?? []) as ProductSnippet[];
}

// ---------------------------------------------------------------------------
// Construction du contexte à partir des produits
// ---------------------------------------------------------------------------
function buildProductContext(products: ProductSnippet[]): string {
  if (!products.length) return '';
  return products
    .map(
      (p) =>
        `- ${p.nom} (ID: ${p.id}) : ${p.prix} ${p.devise}. ${p.description?.slice(0, 150) || ''}`
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------
export async function generateChatResponse(
  userMessage: string,
  options: ChatOptions = {}
): Promise<string> {
  const {
    history = [],
    productLimit = 3,
    temperature = 0.7,
  } = options;

  try {
    // 1. Recherche sémantique pour trouver les produits pertinents
    // ✅ FIX : minScore abaissé à 0.2 pour s'adapter au petit catalogue (62 produits)
    const searchResults = await hybridSearch(userMessage, {
      limit: productLimit,
      minScore: 0.2,
    });
    
    const relevantProductIds = searchResults.map((r) => r.product_id);

    // 2. Récupérer les détails de ces produits
    const products = await fetchProductDetails(relevantProductIds);
    const productContext = buildProductContext(products);

    // 3. Construire le prompt système
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `Tu es l'assistant virtuel de Gercie, une plateforme e-commerce de qualité premium.
Tu aides les clients à trouver des produits, comprendre les fonctionnalités, le suivi de commande, les livraisons, etc.
Réponds de manière concise, aimable et professionnelle, en français.

${productContext ? `Contexte actuel (produits susceptibles d'intéresser l'utilisateur) :
${productContext}
Utilise ces informations si pertinentes, sinon ignore-les.` : ''}

Si la question ne concerne pas le catalogue, réponds normalement.`,
    };

    // 4. Composer la liste complète des messages
    const messages: ChatMessage[] = [
      systemMessage,
      ...history,
      { role: 'user', content: userMessage },
    ];

    // 5. Appeler l'API Groq via le client partagé
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content || 'Désolé, je n’ai pas pu répondre.';
    return reply;
  } catch (error: any) {
    logger.error('Erreur generateChatResponse', error);
    if (error.status === 429) {
      return 'Je suis momentanément surchargé, merci de réessayer dans quelques instants.';
    }
    return 'Une erreur technique m’empêche de répondre pour le moment. Veuillez réessayer.';
  }
}

export async function generateProductSummary(
  productName: string,
  productDescription: string
): Promise<string> {
  const prompt = `Rédige un résumé accrocheur en français (max 100 mots) pour le produit suivant :
Nom : ${productName}
Description complète : ${productDescription}`;

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 150,
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    logger.error('Erreur generateProductSummary', error);
    throw error;
  }
}

export function isProductQuery(message: string): boolean {
  const keywords = [
    'produit', 'acheter', 'prix', 'catégorie', 'recommande', 'similaire',
    'tendance', 'promotion', 'deal', 'livre', 'vêtement', 'électronique',
  ];
  const lower = message.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}