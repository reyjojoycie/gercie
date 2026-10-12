// app/api/admin/promo-banners/route.ts
import { createServiceClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * GET : Récupérer toutes les bannières promo ordonnées
 */
export async function GET() {
  try { await requireAdmin() } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }) }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('promo_banners')
      .select('*')
      .order('ordre', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Fonction utilitaire pour transformer les chaînes vides ou espaces en NULL
const emptyToNull = (val: any) => (val === '' || (typeof val === 'string' && val.trim() === '') ? null : val)

// Schéma de validation pour la modification groupée (PUT)
const updateSchema = z.array(
  z.object({
    id: z.string().uuid("L'id doit être un UUID valide"),
    message: z.string().min(1, "Le message ne peut pas être vide"),
    // Preprocess convertit les chaînes vides "" en null pour plaire à PostgreSQL
    lien: z.preprocess(emptyToNull, z.string().nullable().optional()),
    ordre: z.number().int().optional(),
    actif: z.boolean().optional(),
    date_debut: z.preprocess(emptyToNull, z.string().nullable().optional()),
    date_fin: z.preprocess(emptyToNull, z.string().nullable().optional()),
  })
)

/**
 * PUT : Modifier les bannières existantes en masse (Ordre, messages...)
 */
export async function PUT(request: Request) {
  try { await requireAdmin() } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }) }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON malformé' }, { status: 400 }) }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    
    // On mappe les requêtes de mise à jour
    const updates = parsed.data.map(item => {
      const { id, ...fields } = item // Extraire l'id pour ne pas réécrire la clé primaire
      return supabase
        .from('promo_banners')
        .update(fields)
        .eq('id', id)
    })

    // Exécution simultanée sécurisée par createServiceClient
    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error).map(r => r.error!.message)
    
    if (errors.length > 0) {
      return NextResponse.json({ error: `Erreur PostgreSQL : ${errors.join(', ')}` }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Schéma de validation pour une création unitaire (POST)
const createSchema = z.object({
  message: z.string().min(1, "Le message est obligatoire"),
  lien: z.preprocess(emptyToNull, z.string().nullable().optional()),
  ordre: z.number().int().default(0),
  actif: z.boolean().default(true),
  date_debut: z.preprocess(emptyToNull, z.string().nullable().optional()),
  date_fin: z.preprocess(emptyToNull, z.string().nullable().optional()),
})

/**
 * POST : Créer une nouvelle bannière promotionnelle
 */
export async function POST(request: Request) {
  try { await requireAdmin() } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }) }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON malformé' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('promo_banners').insert(parsed.data)
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}