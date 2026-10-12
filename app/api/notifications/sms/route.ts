// app/api/notifications/sms/route.ts
// ---------------------------------------------------------------------------
// Envoi de SMS transactionnel – Twilio, Validation Zod, Formatage & Logs
// Niveau Ultra‑Premium : robustesse, sécurité et traçabilité
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Configuration Twilio
// ---------------------------------------------------------------------------
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhone = process.env.TWILIO_PHONE_NUMBER

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null

// ---------------------------------------------------------------------------
// Schéma de validation
// ---------------------------------------------------------------------------
const smsSchema = z.object({
  to: z
    .string()
    .min(1, 'Le numéro du destinataire est requis')
    .transform(val => formatPhoneNumber(val)),
  body: z
    .string()
    .min(1, 'Le corps du message est requis')
    .max(480, 'Le message ne doit pas dépasser 480 caractères'),
})

// ---------------------------------------------------------------------------
// Helper : normalise le numéro au format international
// ---------------------------------------------------------------------------
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  // Si numéro congolais avec indicatif 243
  if (cleaned.startsWith('243') && cleaned.length === 12) return `+${cleaned}`
  // Si numéro local à 10 chiffres (ex: 0812345678)
  if (cleaned.startsWith('0') && cleaned.length === 10) return `+243${cleaned.slice(1)}`
  // Sinon, tenter d'ajouter + si pas présent
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

// ---------------------------------------------------------------------------
// POST – Envoyer un SMS
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Rate limiting : 10 requêtes / minute
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `sms-send:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  // Vérification configuration
  if (!twilioClient || !twilioPhone) {
    logger.error('Configuration Twilio manquante')
    return NextResponse.json(
      { error: 'Service SMS indisponible.', code: 'CONFIG_MISSING' },
      { status: 500 }
    )
  }

  try {
    // Validation des données entrantes
    const rawBody = await request.json()
    const parsed = smsSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn({ errors: parsed.error.flatten().fieldErrors }, 'Données SMS invalides')
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { to, body } = parsed.data

    // Signature Gercie automatique (ajoutée au message)
    const messageBody = body.length > 400
      ? body.substring(0, 397) + '...'
      : `${body}\n\n- Gercie`

    // Envoi via Twilio
    const message = await twilioClient.messages.create({
      body: messageBody,
      from: twilioPhone,
      to,
    })

    logger.info({ to, sid: message.sid, status: message.status }, 'SMS envoyé avec succès')

    return NextResponse.json({
      success: true,
      sid: message.sid,
      status: message.status,
    })
  } catch (err: any) {
    logger.error(err, 'Erreur envoi SMS')
    // Twilio renvoie des erreurs spécifiques
    const twilioError = err?.moreInfo ? `Twilio error: ${err.message}` : 'Erreur serveur interne.'
    return NextResponse.json(
      { error: twilioError, code: 'SMS_SEND_FAILED' },
      { status: 500 }
    )
  }
}
