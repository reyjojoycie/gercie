// app/api/auth/signup/complete/route.ts
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  enforceIpLimit,
  jsonNoStore,
  UNVERIFIED_CHANNEL_TTL_HOURS,
  verifyOtp,
} from '@/lib/auth/otp'
import { findSignupConflict, signupCompleteSchema } from '@/lib/auth/signup'
import { AUTH_ERROR_MESSAGES, validateSchema } from '@/lib/validators/auth'

export const runtime = 'nodejs'

async function rollback(admin: any, userId: string) {
  try {
    await admin.from('portefeuilles').delete().eq('id', userId)
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
  } catch (err) {
    console.error('[SIGNUP_COMPLETE] rollback échoué :', (err as Error).message)
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = enforceIpLimit(request, 'signup-complete', 20, 60 * 60 * 1000)
    if (limited) return limited

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonNoStore({ error: 'Corps de requête JSON invalide.' }, 400)
    }

    const validation = validateSchema(signupCompleteSchema, body)
    if (!validation.success) {
      return jsonNoStore({ error: 'Données invalides.', errors: validation.errors }, 400)
    }

    const { nom, prenom, email, telephone, password, channel, code } = validation.data

    const conflict = await findSignupConflict(email, telephone)
    if (conflict) return jsonNoStore({ error: conflict.error }, conflict.status)

    /* 1. Vérifier le code du canal choisi */
    const target = channel === 'email' ? email : telephone
    const check = await verifyOtp({ purpose: 'signup', target, code })

    if (!check.ok) return jsonNoStore({ error: check.error }, check.status)

    const emailVerified = channel === 'email'
    const phoneVerified = channel === 'sms'
    const admin = createServiceClient() as any

    /* 2. Créer l'utilisateur Auth */
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // technique : l'état réel est dans profiles.email_verified
      ...(phoneVerified ? { phone: telephone, phone_confirm: true } : {}),
      user_metadata: { nom, prenom, full_name: `${prenom} ${nom}`.trim() },
      app_metadata: { provider: 'email', type_user: 'acheteur' },
    })

    if (authError || !authData?.user) {
      const message = authError?.message ?? ''
      console.error('[SIGNUP_COMPLETE] création auth :', message)

      if (/phone/i.test(message) && /already|registered|exists/i.test(message)) {
        return jsonNoStore({ error: AUTH_ERROR_MESSAGES.phone_exists }, 409)
      }
      if (/already|registered|exists/i.test(message)) {
        return jsonNoStore({ error: AUTH_ERROR_MESSAGES.email_exists }, 409)
      }
      return jsonNoStore(
        { error: 'Erreur lors de la création du compte. Recommencez l\'inscription.' },
        400
      )
    }

    const user = authData.user

    /* 3. Libérer ce numéro s'il traîne sur un profil non vérifié */
    await admin
      .from('profiles')
      .update({ telephone: null })
      .eq('telephone', telephone)
      .or('phone_verified.is.null,phone_verified.eq.false')
      .neq('id', user.id)

    /* 4. Profil */
    const deadline = new Date(
      Date.now() + UNVERIFIED_CHANNEL_TTL_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: user.id,
        email,
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone,
        type_user: 'acheteur',
        role: 'buyer',
        email_verified: emailVerified,
        phone_verified: phoneVerified,
        verification_deadline: deadline, // l'autre canal sera supprimé après ce délai
        onboarding_completed: false,
        est_actif: true,
        is_admin: false,
        preferences: {
          langue: 'fr',
          devise: 'CDF',
          notifications_email: true,
          notifications_sms: false,
        },
        terms_accepted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (profileError) {
      console.error('[SIGNUP_COMPLETE] profil :', profileError.message)
      await rollback(admin, user.id)
      return jsonNoStore(
        { error: 'Erreur lors de la création du profil. Recommencez l\'inscription.' },
        500
      )
    }

    /* 5. Portefeuille (non bloquant) */
    const { error: walletError } = await admin
      .from('portefeuilles')
      .upsert({ id: user.id, solde_achat: 0, solde_vente: 0 }, { onConflict: 'id' })

    if (walletError) {
      console.error('[SIGNUP_COMPLETE] portefeuille (non bloquant) :', walletError.message)
    }

    return jsonNoStore(
      {
        success: true,
        message: 'Compte créé avec succès.',
        verified_channel: channel,
        redirect: '/login?registered=true',
      },
      201
    )
  } catch (error: any) {
    console.error('[SIGNUP_COMPLETE]', error?.message)
    return jsonNoStore({ error: AUTH_ERROR_MESSAGES.server }, 500)
  }
}