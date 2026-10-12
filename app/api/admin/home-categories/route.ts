// app/api/admin/home-categories/route.ts
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * GET : Récupère la configuration des catégories populaires
 */
export async function GET() {
  try { 
    // Vérification des droits de l'administrateur
    await requireAdmin() 
  } catch (e: any) { 
    return NextResponse.json({ error: e.message || 'Accès interdit' }, { status: 403 }) 
  }

  try {
    // Utilisation du Service Client (Admin, sans cookies, contourne la RLS)
    const supabase = createServiceClient()
    
    const { data, error } = await supabase
      .from('popular_categories_config')
      .select('*')
      .order('ordre', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erreur interne du serveur lors de la récupération' }, 
      { status: 500 }
    )
  }
}

// Schéma Zod pour valider le tableau de modifications envoyé en masse
const updateSchema = z.array(
  z.object({
    id: z.string().uuid("L'ID doit être un UUID valide"),
    display_name: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
    ordre: z.number().int().optional(),
    actif: z.boolean().optional(),
  })
)

/**
 * PUT : Mise à jour en masse des catégories (Noms, Images, Ordre, Visibilité)
 */
export async function PUT(request: Request) {
  try { 
    // Vérification des droits de l'administrateur
    await requireAdmin() 
  } catch (e: any) { 
    return NextResponse.json({ error: e.message || 'Accès interdit' }, { status: 403 }) 
  }

  // 1. Extraction et sécurisation du corps de la requête
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide ou manquant' }, { status: 400 })
  }

  // 2. Validation stricte des types avec Zod
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() }, 
      { status: 400 }
    )
  }

  try {
    // Utilisation du Service Client pour exécuter des requêtes simultanées fiables
    const supabase = createServiceClient()

    // 3. Préparation des requêtes de mise à jour individuelles
    const updates = parsed.data.map((item) => {
      // Extraction de l'id pour ne pas l'inclure dans le corps de la mise à jour PostgreSQL
      const { id, ...updateData } = item
      
      return supabase
        .from('popular_categories_config')
        .update(updateData)
        .eq('id', id)
    })

    // 4. Exécution parallèle et sécurisée de toutes les requêtes en base de données
    const results = await Promise.all(updates)
    
    // 5. Analyse et traitement des erreurs SQL potentielles
    const errors = results.filter((r) => r.error).map((r) => r.error!.message)
    if (errors.length > 0) {
      return NextResponse.json(
        { error: `Erreur lors des mises à jour en base de données : ${errors.join(', ')}` }, 
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erreur interne du serveur lors de la sauvegarde' }, 
      { status: 500 }
    )
  }
}