// scripts/seed.ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function seed() {
  console.log('🌱 Début du seeding...')

  // 1. Créer des utilisateurs de test
  const users = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'acheteur@example.com',
      nom: 'Acheteur',
      prenom: 'Jean',
      telephone: '0812345678',
      type_user: 'acheteur',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'vendeur@example.com',
      nom: 'Vendeur',
      prenom: 'Marie',
      telephone: '0898765432',
      type_user: 'vendeur',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'livreur@example.com',
      nom: 'Livreur',
      prenom: 'Pierre',
      telephone: '0855512345',
      type_user: 'acheteur',
    },
  ]

  for (const user of users) {
    const { error } = await supabase.from('profiles').upsert(user, { onConflict: 'id' })
    if (error) console.error("Erreur insertion profile " + user.email + ":", error.message)
  }

  // 2. Créer un vendeur dans la table 'vendeurs'
  const { error: sellerError } = await supabase
    .from('vendeurs')
    .upsert({ id: '22222222-2222-2222-2222-222222222222', actif: true, boutique_nom: 'Boutique de Marie' }, { onConflict: 'id' })
  if (sellerError) console.error('Erreur création vendeur:', sellerError.message)

  // 3. Créer un livreur dans la table 'livreurs'
  const { error: driverError } = await supabase
    .from('livreurs')
    .upsert({
      id: '33333333-3333-3333-3333-333333333333',
      est_actif: true,
      est_disponible: true,
      total_livraisons: 0,
      distance_parcourue_km: 0,
      zone_operation_principale: 'Kinshasa',
    }, { onConflict: 'id' })
  if (driverError) console.error('Erreur création livreur:', driverError.message)

  // 4. Créer des produits (dont ton fameux Smartphone !)
  const products = [
    {
      vendeur_id: '22222222-2222-2222-2222-222222222222',
      nom: 'Sac à main en cuir',
      prix: 85000,
      description: 'Sac en cuir véritable, fabrication artisanale.',
      categorie: 'Mode & Beauté > Femme > Accessoires > Sacs',
      images: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3'],
      stock: 5,
      negociable: true,
      est_actif: true,
    },
    {
      vendeur_id: '22222222-2222-2222-2222-222222222222',
      nom: 'Smartphone Samsung A54',
      prix: 450000,
      description: 'État neuf, débloqué. Idéal comme téléphone principal.',
      categorie: 'Électronique & Multimédia > Téléphonie > Smartphones > Samsung & Android',
      images: ['https://images.unsplash.com/photo-1616440347437-b1c73416efc2'],
      stock: 2,
      negociable: false,
      est_actif: true,
    },
  ]

  for (const product of products) {
    const { error } = await supabase.from('produits').insert(product)
    if (error) console.error("Erreur insertion produit " + product.nom + ":", error.message)
  }

  // 5. Créer des points de retrait
  const pointsRetrait = [
    {
      nom: 'Point Gercie – Gombe',
      adresse: '123 Avenue de la Paix, Gombe',
      telephone: '+243 971 234 567',
      horaires: 'Lun‑Sam 8h‑18h',
      est_actif: true,
      province_nom: 'Kinshasa',
      ville_nom: 'Kinshasa',
      quartier: 'Gombe',
      points_de_repere: 'En face de la station Total',
      est_partenaire_verifie: true,
    },
    {
      nom: 'Point Gercie – Limete',
      adresse: '45 Boulevard Lumumba, Limete',
      telephone: '+243 973 456 789',
      horaires: 'Lun‑Ven 9h‑17h',
      est_actif: true,
      province_nom: 'Kinshasa',
      ville_nom: 'Kinshasa',
      quartier: 'Limete',
      points_de_repere: 'Près du marché',
      est_partenaire_verifie: false,
    },
  ]

  const { error: prError } = await supabase.from('points_retrait').insert(pointsRetrait)
  if (prError) console.error('Erreur points de retrait:', prError.message)

  console.log('✅ Seeding terminé avec succès !')
}

seed().catch(console.error)