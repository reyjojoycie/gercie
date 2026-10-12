// scripts/index-clip-embeddings.ts
// ✅ Chargement explicite de .env.local avant tout import
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env.local') });

import { generateClipTextEmbedding, generateClipImageEmbedding } from '../lib/ai/imageEmbeddings';
import { upsertProductClipTextEmbedding, upsertProductClipImageEmbedding } from '../lib/ai/vectorStore';
import { createServiceClient } from '../lib/supabaseServer';

// ... reste du code inchangé
async function main() {
  console.log('🚀 Démarrage de l\'indexation CLIP...\n');
  
  const supabase = await createServiceClient();
  
  // 1. Récupérer tous les produits actifs
  const { data: products, error } = await supabase
    .from('produits')
    .select('id, nom, description, images')
    .eq('est_actif', true);
  
  if (error) {
    console.error('❌ Erreur récupération produits:', error);
    process.exit(1);
  }
  
  console.log(`📦 ${products?.length || 0} produits trouvés\n`);
  
  let success = 0;
  let failed = 0;
  
  // 2. Indexer chaque produit un par un
  for (let i = 0; i < (products || []).length; i++) {
    const product = products[i];
    const progress = `[${i + 1}/${products!.length}]`;
    
    try {
      console.log(`${progress} 📝 ${product.nom}`);
      
      // a) Embedding Texte (Nom + Description)
      const text = `${product.nom} ${product.description || ''}`.trim();
      if (text) {
        const textEmb = await generateClipTextEmbedding(text);
        await upsertProductClipTextEmbedding(product.id, textEmb);
        console.log(`   ✅ Embedding texte généré`);
      }
      
      // b) Embedding Image (Première image du tableau)
      const imageUrl = product.images?.[0];
      if (imageUrl) {
        const imageEmb = await generateClipImageEmbedding(imageUrl);
        await upsertProductClipImageEmbedding(product.id, imageEmb);
        console.log(`   ✅ Embedding image généré`);
      }
      
      success++;
      
      // Pause de 500ms pour éviter de surcharger l'API ou la base de données
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err: any) {
      failed++;
      console.error(`   ❌ Erreur sur "${product.nom}": ${err.message}`);
    }
  }
  
  console.log('\n✅ Indexation CLIP terminée !');
  console.log(`   🎉 Succès: ${success}`);
  console.log(`   ⚠️ Échecs: ${failed}`);
}

main().catch(console.error);