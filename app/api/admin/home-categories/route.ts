// app/api/admin/home-categories/route.ts
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdminApi } from '@/lib/auth/adminGuard'
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api-response'
import { z } from 'zod'

/**
 * GET : Récupère la configuration des catégories populaires
 */
export async function GET() {
  const { error: authError } = await requireAdminApi()
  if (authError) return authError

  try {
    // Utilisation du Service Client (Admin, sans cookies, contourne la RLS)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('popular_categories_config')
      .select('*')
      .order('ordre', { ascending: true })

    if (error) {
      return errorResponse(error.message, 500)
    }

    return successResponse(data || [])
  } catch (error: any) {
    return errorResponse(
      error.message || 'Erreur interne du serveur lors de la récupération',
      500
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
  const { error: authError } = await requireAdminApi()
  if (authError) return authError

  // 1. Extraction et sécurisation du corps de la requête
  let body: any
  try {
    body = await request.json()
  } catch {
    return errorResponse('Corps JSON invalide ou manquant', 400)
  }

  // 2. Validation stricte des types avec Zod
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
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
      return errorResponse(
        `Erreur lors des mises à jour en base de données : ${errors.join(', ')}`,
        500
      )
    }

    return successResponse({ updated: true })
  } catch (error: any) {
    return errorResponse(
      error.message || 'Erreur interne du serveur lors de la sauvegarde',
      500
    )
  }
}
