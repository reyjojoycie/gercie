import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/* ========================================================================== */
/*  SCHÉMA DE VALIDATION (ZOD)                                                */
/* ========================================================================== */

const createCategorySchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est requis'),

  parent_id: z
    .string()
    .uuid('ID parent invalide')
    .nullable()
    .optional()
    .or(z.literal('')),

  image_url: z
    .string()
    .url("URL d'image invalide")
    .nullable()
    .optional()
    .or(z.literal('')),

  icone: z
    .string()
    .nullable()
    .optional()
    .or(z.literal('')),

  description: z
    .string()
    .nullable()
    .optional()
    .or(z.literal('')),

  ordre: z.coerce.number().int().optional(),

  actif: z.boolean().optional(),

  afficher_accueil: z.boolean().optional(),

  ordre_accueil: z.coerce.number().int().optional(),
})

/* ========================================================================== */
/*  FONCTIONS UTILITAIRES                                                     */
/* ========================================================================== */

/**
 * Génère un slug unique à partir d'un nom.
 * Gère les accents, les caractères spéciaux et vérifie l'unicité en base.
 */
async function generateUniqueSlug(nom: string, supabase: any): Promise<string> {
  let baseSlug = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^a-z0-9]+/g, '-')     // Remplace les caractères non alphanumériques par des tirets
    .replace(/^-+|-+$/g, '')         // Supprime les tirets en début/fin

  if (!baseSlug) baseSlug = 'categorie'

  let slug = baseSlug
  let suffix = 1

  while (true) {
    const { data: existing, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      console.error('[generateUniqueSlug] Erreur vérification slug:', error)
      throw error
    }

    if (!existing) break

    slug = `${baseSlug}-${suffix}`
    suffix++
  }

  return slug
}

/**
 * Calcule le chemin complet (ex: "Électronique > Smartphones")
 * en remontant la chaîne des parents.
 */
async function buildCheminComplet(
  nom: string,
  parentId: string | null | undefined,
  supabase: any
): Promise<string> {
  if (!parentId) return nom

  const { data: parent, error } = await supabase
    .from('categories')
    .select('chemin_complet')
    .eq('id', parentId)
    .maybeSingle()

  if (error) {
    console.error('[buildCheminComplet] Erreur récupération parent:', error)
    throw error
  }

  if (parent && parent.chemin_complet) {
    return `${parent.chemin_complet} > ${nom}`
  }

  return nom
}

/* ========================================================================== */
/*  GET : Récupérer toutes les catégories (Admin)                             */
/* ========================================================================== */

export async function GET() {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Accès interdit' }, { status: 403 })
  }

  try {
    const supabase = createServiceClient()

    // On récupère TOUTES les catégories (actives et inactives) pour l'admin
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('ordre', { ascending: true })
      .order('nom', { ascending: true })

    if (error) {
      console.error('[API Admin Categories GET] Erreur Supabase:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('[API Admin Categories GET] Crash:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}

/* ========================================================================== */
/*  POST : Créer une nouvelle catégorie                                       */
/* ========================================================================== */

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Accès interdit' }, { status: 403 })
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = createCategorySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Données invalides',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const supabase = createServiceClient()

    const nom = parsed.data.nom.trim()

    const parent_id =
      parsed.data.parent_id === ''
        ? null
        : parsed.data.parent_id ?? null

    const image_url =
      parsed.data.image_url === ''
        ? null
        : parsed.data.image_url ?? null

    const icone =
      parsed.data.icone === '' || parsed.data.icone == null
        ? 'Tag'
        : parsed.data.icone

    const description =
      parsed.data.description === ''
        ? null
        : parsed.data.description?.trim() || null

    const ordre =
      typeof parsed.data.ordre === 'number' ? parsed.data.ordre : 0

    const actif = parsed.data.actif ?? true

    const afficher_accueil = parsed.data.afficher_accueil ?? false

    const ordre_accueil =
      typeof parsed.data.ordre_accueil === 'number'
        ? parsed.data.ordre_accueil
        : 0

    // Vérifier que le parent existe s'il est fourni
    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', parent_id)
        .maybeSingle()

      if (parentError) {
        console.error('[API Admin Categories POST] Erreur vérification parent:', parentError)
        return NextResponse.json({ error: 'Erreur lors de la vérification du parent' }, { status: 500 })
      }

      if (!parent) {
        return NextResponse.json(
          { error: 'Catégorie parente introuvable' },
          { status: 400 }
        )
      }
    }

    // 1. Générer un slug unique pour l'URL
    const slug = await generateUniqueSlug(nom, supabase)

    // 2. Calculer le chemin complet
    const chemin_complet = await buildCheminComplet(nom, parent_id, supabase)

    // 3. Insérer la nouvelle catégorie
    const { data, error } = await supabase
      .from('categories')
      .insert({
        nom,
        slug,
        parent_id,
        image_url,
        icone,
        description,
        chemin_complet,
        ordre,
        actif,
        afficher_accueil,
        ordre_accueil,
      })
      .select()
      .single()

    if (error) {
      console.error('[API Admin Categories POST] Erreur insert:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('[API Admin Categories POST] Crash:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}