// scripts/generate-embeddings.ts
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// MOCK GLOBAL DU LOGGER : Évite le crash "GercieLogger.error is not a function" dans les imports
const fakeLogger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${msg}`, ...args)
};

// On injecte le mock dans l'objet global Node.js au cas où il serait appelé dynamiquement
(global as any).GercieLogger = fakeLogger;
(global as any).logger = fakeLogger;

console.log('🔑 Détection de la configuration d\'environnement...')

async function main() {
  try {
    // Imports dynamiques (après dotenv et l'injection du mock)
    const [
      { generateEmbedding },
      { upsertProductEmbedding },
    ] = await Promise.all([
      import('@/lib/ai/embeddings'),
      import('@/lib/ai/vectorStore'),
    ])

    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')

    const { data: products, error } = await supabaseAdmin
      .from('produits')
      .select('id, nom, description')
      .eq('est_actif', true)
      .order('id')

    if (error) {
      console.error('❌ Erreur lors de la récupération des produits dans Supabase:', error.message)
      process.exit(1)
    }

    if (!products || products.length === 0) {
      console.log('⚠️ Aucun produit trouvé dans la table.')
      process.exit(0)
    }

    console.log(`🤖 Génération des embeddings pour ${products.length} produits...`)
    console.log('⏳ Chargement du modèle d\'IA local (cela peut prendre quelques secondes)...')

    let success = 0
    for (const product of products) {
      try {
        const text = `${product.nom} ${product.description || ''}`.trim()
        if (!text) continue

        // Calcul de l'embedding vectoriel
        const embedding = await generateEmbedding(text)
        
        // Sauvegarde dans la base de données pgvector
        await upsertProductEmbedding(product.id, embedding)

        success++
        console.log(`✅ [${success}/${products.length}] Embedding synchronisé : "${product.nom.substring(0, 40)}..."`)
        
      } catch (err: any) {
        console.error(`❌ Échec pour le produit ${product.id} (${product.nom}) :`, err.message || err)
      }
    }

    console.log(`\n🎉 Terminé ! ${success} embeddings sémantiques synchronisés sur ${products.length} produits.`)
    process.exit(0)
  } catch (globalError: any) {
    console.error('❌ Erreur critique lors de l\'exécution du script sémantique :', globalError)
    process.exit(1)
  }
}

main()