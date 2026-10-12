// app/api/auth/verify-email/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabaseServer'
import { verifyVerificationCode, checkRateLimit, getUserRateLimitKey } from '@/lib/security'
import { AUTH_ERROR_MESSAGES } from '@/lib/validators/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: AUTH_ERROR_MESSAGES.session_expired }, { status: 401 })
    }

    // Rate limiting
    const rateLimitKey = getUserRateLimitKey(user.id, 'verify-email-confirm')
    const rateLimit = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: AUTH_ERROR_MESSAGES.rate_limited }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const code = body?.code?.trim()

    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code invalide.' }, { status: 400 })
    }

    // Vérifier le code
    const result = await verifyVerificationCode(user.id, 'email_verify', code, { invalidateOnSuccess: true })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || AUTH_ERROR_MESSAGES.code_invalid },
        { status: result.error === AUTH_ERROR_MESSAGES.code_expired ? 410 : 400 }
      )
    }

    // Mettre à jour Supabase Auth
    const supabaseAdmin = createServiceClient()
    await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true })

    // ✅ Mettre à jour profiles.email_verified
    await supabaseAdmin
      .from('profiles')
      .update({ email_verified: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      message: 'Email vérifié avec succès !',
      email_verified: true,
    })
  } catch (error: any) {
    return NextResponse.json({ error: AUTH_ERROR_MESSAGES.server }, { status: 500 })
  }
}