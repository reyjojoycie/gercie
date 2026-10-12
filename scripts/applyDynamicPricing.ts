// scripts/applyDynamicPricing.ts
// ============================================================================
// Script de pricing dynamique pour Gercie.
// Analyse la demande, la rareté et les tendances du marché afin de suggérer
// (et éventuellement d’appliquer) des prix optimaux pour chaque produit.
//
// Usage :
//   npx tsx scripts/applyDynamicPricing.ts [--dry-run] [--product <id>] [--all]
//   npx tsx scripts/applyDynamicPricing.ts --product <id> --dry-run
//   npx tsx scripts/applyDynamicPricing.ts --all
// ============================================================================

import { config } from 'dotenv'
import { resolve } from 'path'

// Charge les variables d'environnement (priorité à .env.local)
config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

import { supabaseAdmin } from '../lib/supabaseAdmin'
import { getSuggestedPrice } from '../lib/dynamicPricing'

// ---------------------------------------------------------------------------
// Analyse des arguments de la ligne de commande
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')
const productIdx = args.indexOf('--product')
let productId: string | null = null
if (productIdx !== -1 && args[productIdx + 1]) {
  productId = args[productIdx + 1]
}

if (!productId && !all) {
  console.log(`
🛠️  Gercie – Outil de Pricing Dynamique

Usage :
  npx tsx scripts/applyDynamicPricing.ts [--dry-run] [--product <id>] [--all]

Exemples :
  npx tsx scripts/applyDynamicPricing.ts --product <id> --dry-run
  npx tsx scripts/applyDynamicPricing.ts --all
`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Routine principale
// ---------------------------------------------------------------------------
async function main() {
  const supabase = supabaseAdmin

  // --- Récupération des IDs des produits à traiter ---
  let productIds: string[] = []
  if (productId) {
    productIds = [productId]
  } else if (all) {
    const { data, error } = await supabase
      .from('produits')
      .select('id, nom')
      .eq('est_actif', true)
    if (error) {
      console.error('❌ Erreur lors de la récupération des produits :', error.message)
      process.exit(1)
    }
    productIds = (data || []).map((p) => p.id)
  }

  console.log(`\n📊 Traitement de ${productIds.length} produit(s)${dryRun ? ' (dry‑run)' : ''}…\n`)

  let updatedCount = 0
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i]
    const progress = `[${(i + 1).toString().padStart(3, '0')}/${productIds.length}]`
    process.stdout.write(`${progress} Produit ${pid} … `)

    try {
      const result = await getSuggestedPrice(pid)
      console.log(
        `\n   Prix actuel : ${result.suggestedPrice.toLocaleString()} FC   (${result.adjustmentPercent > 0 ? '+' : ''}${result.adjustmentPercent} %)`
      )
      console.log(`   ${result.reasoning}`)

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('produits')
          .update({
            prix: result.suggestedPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pid)

        if (updateError) {
          console.log(`   ❌ Erreur mise à jour : ${updateError.message}`)
        } else {
          console.log('   ✅ Prix mis à jour.')
          updatedCount++
        }
      }
    } catch (err: any) {
      console.log(`\n   ❌ ${err.message}`)
    }
  }

  console.log('\n✨ Terminé.')
  if (!dryRun) {
    console.log(`   ${updatedCount} produit(s) mis à jour.`)
  }
}

main().catch(console.error)