import { createClient } from '@/lib/supabaseServer'
import { requireAdminApi } from '@/lib/auth/adminGuard'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(request: Request) {
  const { error: authError } = await requireAdminApi()
  if (authError) return authError

  let body: any
  try {
    body = await request.json()
  } catch {
    return errorResponse('Corps JSON invalide', 400)
  }

  const { userId } = body
  if (!userId) return errorResponse('userId requis', 400)

  const newPassword = Math.random().toString(36).slice(-8) // génération simple
  const supabase = await createClient(true)
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return errorResponse(error.message, 500)

  return successResponse({ newPassword })
}
