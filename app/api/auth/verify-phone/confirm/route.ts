// app/api/auth/verify-phone/confirm/route.ts
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { invalidateProfileCache } from '@/lib/auth'
import { jsonNoStore, verifyOtp } from '@/lib/auth/otp'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonNoStore({ error: AUTH_ERROR_MESSAGES.session_expired }, 401)

    const body = (await request.json().catch(() => ({}))) as { code?: string }
    const code = String(body?.code ?? '').trim()

    const check = await verifyOtp({ purpose: 'verify_phone', userId: user.id, code })
    if (!check.ok) return jsonNoStore({ error: check.error }, check.status)

    const target = check.row.target
    const admin = createServiceClient() as any

    // Libérer ce numéro s'il traîne sur un autre profil non vérifié
    await admin
      .from('profiles')
      .update({ telephone: null })
      .eq('telephone', target)
      .or('phone_verified.is.null,phone_verified.eq.false')
      .neq('id', user.id)

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      phone: target,
      phone_confirm: true,
    })

    if (authError) {
      console.error('[VERIFY_PHONE_CONFIRM] auth :', authError.message)
      const taken = /already|registered|exists/i.test(authError.message)
      return jsonNoStore(
        { error: taken ? AUTH_ERROR_MESSAGES.phone_exists : 'Erreur lors de la confirmation.' },
        taken ? 409 : 500
      )
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ telephone: target, phone_verified: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileError) {
      console.error('[VERIFY_PHONE_CONFIRM] profil :', profileError.message)
      return jsonNoStore({ error: 'Erreur lors de la confirmation de votre téléphone.' }, 500)
    }

    invalidateProfileCache(user.id)

    return jsonNoStore({
      success: true,
      message: 'Votre numéro de téléphone a été vérifié avec succès !',
      phone_verified: true,
    })
  } catch (error: any) {
    console.error('[VERIFY_PHONE_CONFIRM]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}