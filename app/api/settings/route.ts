// app/api/settings/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdminApi } from '@/lib/auth/adminGuard'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  if (!key) return errorResponse('Paramètre key requis', 400)

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data) return successResponse({ value: null })
    return successResponse({ value: data.value })
  } catch (err: any) {
    return errorResponse(err.message || 'Erreur lors de la récupération des paramètres', 500)
  }
}

export async function PUT(request: Request) {
  const { error: authError } = await requireAdminApi()
  if (authError) return authError

  const body = await request.json()
  const { key, value } = body
  if (!key || value === undefined) return errorResponse('key et value requis', 400)

  try {
    const supabase = await createClient(true)
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })

    if (error) throw error
    return successResponse({ updated: true })
  } catch (err: any) {
    return errorResponse(err.message || 'Erreur lors de la sauvegarde du paramètre', 500)
  }
}
