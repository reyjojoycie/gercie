// app/api/notifications/email/route.ts
// ---------------------------------------------------------------------------
// Envoi d'email transactionnel – Resend, Template Luxe, Validation & Logs
// Niveau Ultra‑Premium : Emails pixel perfect, sécurité et traçabilité
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// Configuration Resend (initialisée une seule fois)
// ---------------------------------------------------------------------------
const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM || 'Gercie <no-reply@gercie.com>'

// ---------------------------------------------------------------------------
// Schéma de validation
// ---------------------------------------------------------------------------
const emailSchema = z.object({
  to: z.string().email('Adresse email du destinataire invalide'),
  subject: z.string().min(1, 'Le sujet est requis').max(200, 'Sujet trop long'),
  html: z.string().min(1, 'Le contenu HTML est requis').max(100000, 'Contenu trop volumineux'),
})

// ---------------------------------------------------------------------------
// Template Luxe Gercie (enveloppe HTML réutilisable)
// ---------------------------------------------------------------------------
export function wrapWithLuxeTemplate(innerHtml: string): string {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin:0; padding:0; background-color:#f4f3f0; font-family: 'Outfit', sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f3f0;">
        <tr>
          <td align="center" style="padding: 40px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.08); overflow: hidden;">
              <!-- HEADER PREMIUM -->
              <tr>
                <td style="background: linear-gradient(135deg, #1d3ab8 0%, #6d39d2 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="margin:0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                    <span style="color: #e8be4c;">G</span>ercie
                  </h1>
                  <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Marketplace de prestige</p>
                </td>
              </tr>
              <!-- CORPS -->
              <tr>
                <td style="padding: 40px 32px;">
                  ${innerHtml}
                </td>
              </tr>
              <!-- FOOTER -->
              <tr>
                <td style="background: #fafaf9; padding: 24px 32px; border-top: 1px solid #e7e5e0;">
                  <p style="margin:0; font-size: 12px; color: #7d7970; text-align: center;">
                    © ${new Date().getFullYear()} Gercie. Tous droits réservés.<br>
                    Cet email a été envoyé automatiquement, merci de ne pas y répondre.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

// ---------------------------------------------------------------------------
// POST – Envoyer un email transactionnel
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Rate limiting : 10 req/min (éviter les abus)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `email-send:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    // Validation des données entrantes
    const rawBody = await request.json()
    const parsed = emailSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        'Données email invalides'
      )
      return NextResponse.json(
        {
          error: 'Données invalides.',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { to, subject, html } = parsed.data

    // Envelopper le contenu dans le template luxe Gercie
    const luxeHtml = wrapWithLuxeTemplate(html)

    // Envoyer l'email via Resend
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html: luxeHtml,
    })

    if (error) {
      logger.error(error, `Échec envoi email à ${to}`)
      return NextResponse.json(
        { error: error.message, code: 'RESEND_ERROR' },
        { status: 500 }
      )
    }

    logger.info({ to, subject, messageId: data?.id }, 'Email envoyé avec succès')

    return NextResponse.json({
      success: true,
      messageId: data?.id,
    })
  } catch (err: any) {
    logger.error(err, 'Crash envoi email')
    return NextResponse.json(
      { error: 'Erreur serveur interne.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
