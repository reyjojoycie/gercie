// app/api/admin/testimonials/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
// 1. ❌ ON SUPPRIME l'ancien package obsolète :
// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
// 2.  ON UTILISE votre propre client d'infrastructure :
import { createClient } from '@/lib/supabaseServer'
import { z } from 'zod'

/* ========================================================================== */
/* Helpers                                                                   */
/* ========================================================================== */

async function requireAdmin(request: NextRequest) {
  // 💡 On utilise le client classique (non-admin) pour vérifier la session de l'utilisateur
  const supabase = await createClient(false)
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()

  if (profileError || !profile || profile.is_admin !== true) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  return null
}

function successResponse(data: any, meta?: any, status = 200) {
  return NextResponse.json({ success: true, data, meta }, { status })
}

function errorResponse(message: string, status = 400, details?: any) {
  return NextResponse.json({ success: false, error: message, details }, { status })
}

const isValidUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)

/* ========================================================================== */
/* Schémas de validation                                                     */
/* ========================================================================== */
const updateTestimonialSchema = z
  .object({
    name: z.string().min(2, 'Le nom doit comporter au moins 2 caractères').optional(),
    role: z.string().optional().nullable(),
    text: z.string().min(10, 'Le témoignage doit comporter au moins 10 caractères').optional(),
    rating: z.number().int().min(1).max(5).optional(),
    produit: z.string().optional().nullable(),
    verified: z.boolean().optional(),
    status: z.enum(['published', 'pending', 'rejected']).optional(),
    is_featured: z.boolean().optional(),
    admin_response: z.string().optional().nullable(),
    avatar: z.string().url().optional().nullable(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'Au moins un champ à mettre à jour est requis'
  )

/* ========================================================================== */
/* GET                                                                       */
/* ========================================================================== */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request)
  if (authError) return authError

  const { id } = await params
  if (!isValidUUID(id)) {
    return errorResponse('ID invalide', 400)
  }

  try {
    // 💡 On utilise le service role (true) pour lire n'importe quel témoignage (même masqué)
    const supabase = await createClient(true)
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Témoignage introuvable', 404)
      }
      console.error('Erreur lors de la récupération du témoignage:', error)
      return errorResponse('Erreur serveur', 500)
    }

    return successResponse(data)
  } catch (error) {
    console.error('Erreur inattendue:', error)
    return errorResponse('Erreur interne du serveur', 500)
  }
}

/* ========================================================================== */
/* PATCH                                                                     */
/* ========================================================================== */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request)
  if (authError) return authError

  const { id } = await params
  if (!isValidUUID(id)) {
    return errorResponse('ID invalide', 400)
  }

  try {
    // 💡 Ici aussi, on force le mode administrateur (true) pour contourner la RLS
    const supabase = await createClient(true)

    const { data: existing, error: fetchError } = await supabase
      .from('testimonials')
      .select('id, name')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return errorResponse('Témoignage introuvable', 404)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return errorResponse('Corps JSON requis', 400)
    }

    // Extraction préventive des métadonnées pour éviter que .strict() ne rejette la requête
    const { id: _id, date: _date, created_at: _c, updated_at: _u, ...cleanBody } = body

    const parsed = updateTestimonialSchema.safeParse(cleanBody)
    if (!parsed.success) {
      return errorResponse(
        'Données invalides',
        400,
        parsed.error.flatten().fieldErrors
      )
    }

    const updates = parsed.data

    const { data, error } = await supabase
      .from('testimonials')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur lors de la mise à jour du témoignage:', error)
      return errorResponse('Erreur lors de la mise à jour', 500)
    }

    return successResponse(data)
  } catch (error) {
    console.error('Erreur inattendue:', error)
    return errorResponse('Erreur interne du serveur', 500)
  }
}

/* ========================================================================== */
/* DELETE                                                                    */
/* ========================================================================== */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request)
  if (authError) return authError

  const { id } = await params
  if (!isValidUUID(id)) {
    return errorResponse('ID invalide', 400)
  }

  try {
    // 💡 Autorisation totale forcée via la clé secrète service_role
    const supabase = await createClient(true)

    const { data: existing, error: fetchError } = await supabase
      .from('testimonials')
      .select('id, is_featured')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return errorResponse('Témoignage introuvable', 404)
    }

    const { error } = await supabase
      .from('testimonials')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erreur lors de la suppression du témoignage:', error)
      return errorResponse('Erreur lors de la suppression', 500)
    }

    return successResponse({ id }, null, 200)
  } catch (error) {
    console.error('Erreur inattendue:', error)
    return errorResponse('Erreur interne du serveur', 500)
  }
}