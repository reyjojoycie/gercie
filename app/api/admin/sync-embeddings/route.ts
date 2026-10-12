// app/api/admin/sync-embeddings/route.ts
// Script d'indexation des produits pour la recherche sémantique
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabaseServer';
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function GET() {
  try {
    console.log('🚀 [SYNC] Début de l\'indexation des embeddings...');
    
    const supabase = await createServerClient();
    
    // 1. Compter les produits restants à indexer
    console.log('📊 [SYNC] Comptage des produits...');
    const { count: remainingCount, error: countError } = await supabase
      .from('produits')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    if (countError) {
      console.error('❌ [SYNC] Erreur comptage:', countError.message);
      return NextResponse.json({ 
        success: false,
        error: 'Erreur comptage BDD', 
        details: countError.message 
      }, { status: 500 });
    }

    // 2. Compter le total de produits
    const { count: totalCount } = await supabase
      .from('produits')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 [SYNC] Total: ${totalCount}, Restants: ${remainingCount}`);

    if (remainingCount === 0) {
      console.log('✅ [SYNC] Tous les produits sont déjà indexés !');
      return NextResponse.json({ 
        success: true,
        message: `✅ SUCCÈS TOTAL : Tous les ${totalCount} produits sont indexés !`,
        indexed: totalCount,
        remaining: 0,
        total: totalCount
      });
    }

    // 3. Récupérer un lot de produits sans embedding
    console.log(`📥 [SYNC] Récupération de 15 produits sans embedding...`);
    const { data: produits, error } = await supabase
      .from('produits')
      .select('id, nom, description')
      .is('embedding', null)
      .limit(15);

    if (error) {
      console.error('❌ [SYNC] Erreur lecture BDD:', error.message);
      return NextResponse.json({ 
        success: false,
        error: 'Erreur lecture BDD', 
        details: error.message 
      }, { status: 500 });
    }

    if (!produits || produits.length === 0) {
      console.log('✅ [SYNC] Aucun produit à indexer');
      return NextResponse.json({ 
        success: true,
        message: '✅ Aucun produit à indexer',
        indexed: 0,
        remaining: 0,
        total: totalCount
      });
    }

    console.log(`📥 [SYNC] ${produits.length} produits récupérés`);

    // 4. Préparer les textes pour l'IA
    const texts = produits.map(p => {
      const nom = p.nom || '';
      const desc = p.description || '';
      return `${nom}. ${desc}`.trim();
    });

    console.log(`🧠 [SYNC] Génération de ${texts.length} embeddings...`);

    // 5. Générer les embeddings (utilise le modèle Xenova local)
    const embeddings = await generateEmbeddingsBatch(texts);
    console.log(`✅ [SYNC] ${embeddings.length} embeddings générés`);

    // 6. Sauvegarder les embeddings en base
    let successCount = 0;
    const errors = [];

    console.log(`💾 [SYNC] Sauvegarde en base de données...`);
    for (let i = 0; i < produits.length; i++) {
      const productId = produits[i].id;
      const embedding = embeddings[i];

      console.log(`💾 [SYNC] Update produit ${i + 1}/${produits.length}: ${productId}`);

      const { error: updateError } = await supabase
        .from('produits')
        .update({ embedding: embedding })
        .eq('id', productId);

      if (updateError) {
        errors.push({ id: productId, error: updateError.message });
        console.error(`❌ [SYNC] Erreur update ${productId}:`, updateError.message);
      } else {
        successCount++;
        console.log(`✅ [SYNC] Produit ${productId} indexé avec succès`);
      }
    }

    const newRemaining = (remainingCount || 0) - successCount;

    console.log(`🎉 [SYNC] Terminé : ${successCount}/${produits.length} produits indexés`);

    return NextResponse.json({ 
      success: true,
      message: `⚡ Succès : ${successCount}/${produits.length} produits indexés. Il en reste ${newRemaining}. Rafraîchissez la page.`,
      indexed: successCount,
      remaining: newRemaining,
      total: totalCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err: any) {
    console.error('❌ [SYNC] Erreur critique:', err);
    console.error('Stack:', err.stack);
    return NextResponse.json({ 
      success: false,
      error: 'Erreur serveur', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}