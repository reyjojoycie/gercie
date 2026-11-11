import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { z } from 'zod'

/* ========================================================================== */
/*  SCHÉMA DE VALIDATION                                                      */
/* ========================================================================== */

const updateCategorySchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est requis').optional(),

  parent_id: z
    .union([z.string().uuid('ID parent invalide'), z.null(), z.literal('')])
    .optional(),

  image_url: z
    .union([z.string().url("URL d'image invalide"), z.null(), z.literal('')])
    .optional(),

  icone: z.union([z.string(), z.null()]).optional(),

  description: z.union([z.string(), z.null()]).optional(),

  ordre: z.coerce.number().int().optional(),

  actif: z.boolean().optional(),

  afficher_accueil: z.boolean().optional(),

  ordre_accueil: z.coerce.number().int().optional(),
})

/* ========================================================================== */
/*  HELPERS                                                                   */
/* ========================================================================== */

async function resolveParams(context: any): Promise<{ id?: string }> {
  try {
    const params = await context?.params
    return params ?? {}
  } catch {
    return {}
  }
}

/**
 * Vérifie si déplacer categoryId sous newParentId créerait une boucle.
 * Exemple interdit : A -> B -> A
 */
async function wouldCreateCycle(
  supabase: any,
  categoryId: string,
  newParentId: string | null
): Promise<boolean> {
  if (!newParentId) return false
  if (newParentId === categoryId) return true

  const { data, error } = await supabase
    .from('categories')
    .select('id, parent_id')

  if (error) {
    console.error('[wouldCreateCycle] Erreur récupération catégories:', error)
    throw error
  }

  const parentByChild = new Map<string, string | null>()

  ;(data || []).forEach((cat: any) => {
    parentByChild.set(cat.id, cat.parent_id ?? null)
  })

  let currentId: string | null = newParentId
  const visited = new Set<string>()

  while (currentId) {
    if (currentId === categoryId) return true

    if (visited.has(currentId)) {
      // Boucle déjà présente en base : on évite un freeze infini.
      return false
    }

    visited.add(currentId)
    currentId = parentByChild.get(currentId) ?? null
  }

  return false
}

/**
 * Calcule le chemin complet d'une catégorie.
 * Exemple : "Électronique > Smartphones"
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

/**
 * Recalcule le chemin complet de tous les descendants après changement
 * de nom ou de parent.
 */
async function rebuildDescendantPaths(
  supabase: any,
  rootId: string,
  rootPath: string
): Promise<void> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, nom, parent_id, chemin_complet')

  if (error) {
    console.error('[rebuildDescendantPaths] Erreur récupération catégories:', error)
    throw error
  }

  const childrenByParent = new Map<string, any[]>()

  ;(data || []).forEach((cat: any) => {
    if (cat.parent_id) {
      const list = childrenByParent.get(cat.parent_id) ?? []
      list.push(cat)
      childrenByParent.set(cat.parent_id, list)
    }
  })

  const updates: { id: string; chemin_complet: string }[] = []
  const visited = new Set<string>([rootId])

  const queue: { id: string; path: string }[] = [
    { id: rootId, path: rootPath },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    const children = childrenByParent.get(current.id) ?? []

    for (const child of children) {
      if (visited.has(child.id)) continue

      visited.add(child.id)

      const childPath = `${current.path} > ${child.nom}`

      if (child.chemin_complet !== childPath) {
        updates.push({
          id: child.id,
          chemin_complet: childPath,
        })
      }

      queue.push({
        id: child.id,
        path: childPath,
      })
    }
  }

  if (updates.length === 0) return

  const results = await Promise.allSettled(
    updates.map((update) =>
      supabase
        .from('categories')
        .update({ chemin_complet: update.chemin_complet })
        .eq('id', update.id)
    )
  )

  const failed = results.find((r) => r.status === 'rejected')

  if (failed) {
    console.error('[rebuildDescendantPaths] Échec mise à jour descendants:', failed)
    throw new Error('Mise à jour des sous-catégories impossible.')
  }
}

/**
 * Ordre sécurisé de suppression : enfants d'abord, puis parent.
 */
async function getDeletionOrder(
  supabase: any,
  rootId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, parent_id')

  if (error) {
    console.error('[getDeletionOrder] Erreur récupération catégories:', error)
    throw error
  }

  const childrenByParent = new Map<string, string[]>()

  ;(data || []).forEach((cat: any) => {
    if (cat.parent_id) {
      const list = childrenByParent.get(cat.parent_id) ?? []
      list.push(cat.id)
      childrenByParent.set(cat.parent_id, list)
    }
  })

  const result: string[] = []
  const visited = new Set<string>()

  const walk = (currentId: string) => {
    if (visited.has(currentId)) return

    visited.add(currentId)

    const children = childrenByParent.get(currentId) ?? []
    children.forEach(walk)

    result.push(currentId)
  }

  walk(rootId)

  return result
}

/**
 * Update tolérant : si une colonne n'existe pas dans la table,
 * on la retire du payload et on réessaie.
 * Cela évite les 500 dus à updated_at / chemin_complet / autres colonnes absentes.
 */
async function updateCategorySafe(
  supabase: any,
  id: string,
  payload: Record<string, any>
) {
  let currentPayload = { ...payload }

  while (Object.keys(currentPayload).length > 0) {
    const { data, error } = await supabase
      .from('categories')
      .update(currentPayload)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (!error) {
      return { data, error: null }
    }

    const message = String(error.message || '')

    // Exemple : column "updated_at" of relation "categories" does not exist
    const columnMatch = message.match(
      /column "([^"]+)" of relation "categories" does not exist/i
    )

    if (columnMatch && columnMatch[1] in currentPayload) {
      delete currentPayload[columnMatch[1]]
      continue
    }

    return { data: null, error }
  }

  // Si toutes les colonnes ont été retirées, on renvoie la catégorie actuelle.
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return { data, error }
}

/* ========================================================================== */
/*  GET : Récupérer une catégorie spécifique                                  */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: any
) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Accès interdit' },
      { status: 403 }
    )
  }

  try {
    const { id } = await resolveParams(context)

    if (!id) {
      return NextResponse.json({ error: 'ID manquant' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('[API Admin Category GET] Erreur Supabase:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[API Admin Category GET] Crash:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}

/* ========================================================================== */
/*  PUT / PATCH : Modifier une catégorie                                      */
/* ========================================================================== */

async function updateCategoryHandler(
  request: NextRequest,
  context: any
) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Accès interdit' },
      { status: 403 }
    )
  }

  let body: any

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const parsed = updateCategorySchema.safeParse(body)

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
    const { id } = await resolveParams(context)

    if (!id) {
      return NextResponse.json({ error: 'ID manquant' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const updates = parsed.data

    // 1. Récupérer l'ancienne catégorie
    const { data: oldCat, error: oldError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (oldError) {
      console.error('[API Admin Category PUT] Erreur récupération catégorie:', oldError)
      return NextResponse.json({ error: oldError.message }, { status: 500 })
    }

    if (!oldCat) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 })
    }

    // 2. Construire uniquement les champs réellement envoyés
    const payload: Record<string, any> = {}

    if (updates.nom !== undefined) {
      payload.nom = updates.nom.trim()
    }

    if (updates.parent_id !== undefined) {
      payload.parent_id =
        updates.parent_id === '' ? null : updates.parent_id
    }

    if (updates.image_url !== undefined) {
      payload.image_url =
        updates.image_url === '' ? null : updates.image_url
    }

    if (updates.icone !== undefined) {
      payload.icone = updates.icone === '' ? null : updates.icone
    }

    if (updates.description !== undefined) {
      payload.description =
        updates.description === ''
          ? null
          : String(updates.description).trim() || null
    }

    if (updates.ordre !== undefined) {
      payload.ordre = updates.ordre
    }

    if (updates.actif !== undefined) {
      payload.actif = updates.actif
    }

    if (updates.afficher_accueil !== undefined) {
      payload.afficher_accueil = updates.afficher_accueil
    }

    if (updates.ordre_accueil !== undefined) {
      payload.ordre_accueil = updates.ordre_accueil
    }

    // Rien à mettre à jour
    if (Object.keys(payload).length === 0) {
      return NextResponse.json(oldCat)
    }

    const parentWasProvided = Object.prototype.hasOwnProperty.call(payload, 'parent_id')
    const nameWasProvided = Object.prototype.hasOwnProperty.call(payload, 'nom')

    const newParentId = parentWasProvided
      ? payload.parent_id
      : oldCat.parent_id ?? null

    const newNom = nameWasProvided ? payload.nom : oldCat.nom

    const parentChanged = parentWasProvided && newParentId !== (oldCat.parent_id ?? null)
    const nameChanged = nameWasProvided && newNom !== oldCat.nom

    // 3. Si un parent est fourni, le vérifier
    if (newParentId) {
      const { data: parent, error: parentError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', newParentId)
        .maybeSingle()

      if (parentError) {
        console.error('[API Admin Category PUT] Erreur vérification parent:', parentError)
        return NextResponse.json(
          { error: 'Erreur lors de la vérification du parent' },
          { status: 500 }
        )
      }

      if (!parent) {
        return NextResponse.json(
          { error: 'Catégorie parente introuvable' },
          { status: 400 }
        )
      }

      const hasCycle = await wouldCreateCycle(supabase, id, newParentId)

      if (hasCycle) {
        return NextResponse.json(
          {
            error:
              'Impossible de déplacer une catégorie dans l’une de ses sous-catégories.',
          },
          { status: 400 }
        )
      }
    }

    // 4. Recalculer le chemin uniquement si nom ou parent change
    if (nameChanged || parentChanged) {
      const newPath = await buildCheminComplet(newNom, newParentId, supabase)

      payload.nom = newNom
      payload.parent_id = newParentId ?? null
      payload.chemin_complet = newPath
    }

    // 5. Appliquer la mise à jour
    const { data, error } = await updateCategorySafe(supabase, id, payload)

    if (error) {
      console.error('[API Admin Category PUT] Erreur update:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 })
    }

    // 6. Mettre à jour les descendants si le chemin a changé
    if (
      payload.chemin_complet &&
      oldCat.chemin_complet !== payload.chemin_complet
    ) {
      try {
        await rebuildDescendantPaths(supabase, id, payload.chemin_complet)
      } catch (descendantError: any) {
        console.error(
          '[API Admin Category PUT] Erreur mise à jour descendants:',
          descendantError
        )
        // On ne bloque pas la réponse principale : la catégorie mère est déjà mise à jour.
      }
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[API Admin Category PUT] Crash:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, context: any) {
  return updateCategoryHandler(request, context)
}

export async function PATCH(request: NextRequest, context: any) {
  return updateCategoryHandler(request, context)
}

/* ========================================================================== */
/*  DELETE : Supprimer une catégorie et ses sous-catégories                   */
/* ========================================================================== */

export async function DELETE(
  _request: NextRequest,
  context: any
) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Accès interdit' },
      { status: 403 }
    )
  }

  try {
    const { id } = await resolveParams(context)

    if (!id) {
      return NextResponse.json({ error: 'ID manquant' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Vérifier existence
    const { data: exists, error: existsError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existsError) {
      console.error('[API Admin Category DELETE] Erreur vérification:', existsError)
      return NextResponse.json({ error: existsError.message }, { status: 500 })
    }

    if (!exists) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 })
    }

    // Supprimer d'abord les descendants, puis la catégorie elle-même.
    const idsToDelete = await getDeletionOrder(supabase, id)

    for (const deleteId of idsToDelete) {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteId)

      if (error) {
        console.error('[API Admin Category DELETE] Erreur:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Catégorie et ses sous-catégories supprimées.',
      deleted_count: idsToDelete.length,
    })
  } catch (error: any) {
    console.error('[API Admin Category DELETE] Crash:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}