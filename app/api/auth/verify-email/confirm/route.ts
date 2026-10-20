// app/api/auth/verify-email/confirm/route.ts
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

    const check = await verifyOtp({ purpose: 'verify_email', userId: user.id, code })
    if (!check.ok) return jsonNoStore({ error: check.error }, check.status)

    const target = check.row.target
    const admin = createServiceClient() as any

    const emailChanged = target !== (user.email || '').toLowerCase()

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      ...(emailChanged ? { email: target } : {}),
      email_confirm: true,
    })

    if (authError) {
      console.error('[VERIFY_EMAIL_CONFIRM] auth :', authError.message)
      const taken = /already|registered|exists/i.test(authError.message)
      return jsonNoStore(
        { error: taken ? AUTH_ERROR_MESSAGES.email_exists : 'Erreur lors de la confirmation.' },
        taken ? 409 : 500
      )
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ email: target, email_verified: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileError) {
      console.error('[VERIFY_EMAIL_CONFIRM] profil :', profileError.message)
      return jsonNoStore({ error: 'Erreur lors de la confirmation de votre email.' }, 500)
    }

    invalidateProfileCache(user.id)

    return jsonNoStore({ success: true, message: 'Email vérifié avec succès !', email_verified: true })
  } catch (error: any) {
    console.error('[VERIFY_EMAIL_CONFIRM]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}