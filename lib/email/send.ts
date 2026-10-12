// lib/email/send.ts
import { Resend } from 'resend'

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from?: string
}

/**
 * Envoie un email transactionnel via Resend.
 * En mode développement, si la clé API n'est pas configurée, log le contenu dans la console.
 *
 * @returns true si l'envoi a réussi, false sinon
 */
export async function sendEmail({
  to,
  subject,
  html,
  from = process.env.EMAIL_FROM || 'onboarding@resend.dev',
}: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.warn('RESEND_API_KEY non configuré. Email non envoyé.')
    console.log('--- Contenu de l\'email ---')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(html)
    return false
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })

    if (error) {
      console.error('Erreur Resend:', error.message)
      return false
    }

    console.log('Email envoyé avec succès, ID:', data?.id)
    return true
  } catch (err: any) {
    console.error('Erreur inattendue lors de l’envoi de l’email:', err)
    return false
  }
}