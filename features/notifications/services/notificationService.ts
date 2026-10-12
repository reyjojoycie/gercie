// features/notifications/services/notificationService.ts
import { createClient } from '@/lib/supabaseServer'
import { Resend } from 'resend'             // Service d'envoi d'emails (remplacez par votre fournisseur)
import { Twilio } from 'twilio'             // Service SMS (optionnel – adaptez selon votre implémentation)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const resend = new Resend(process.env.RESEND_API_KEY!)
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null

// ---------------------------------------------------------------------------
// Envoi d'email (transactionnel)
// ---------------------------------------------------------------------------
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY non définie – email non envoyé')
    return
  }
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gercie <no-reply@gercie.cd>',
      to,
      subject,
      html,
    })
    console.log(`Email envoyé à ${to}`)
  } catch (error) {
    console.error('Erreur envoi email:', error)
    throw new Error('Échec de l\'envoi de l\'email')
  }
}

// ---------------------------------------------------------------------------
// Envoi de SMS (via Twilio ou autre fournisseur)
// ---------------------------------------------------------------------------
export async function sendSMS(phone: string, message: string): Promise<void> {
  if (!twilioClient) {
    console.warn('Twilio non configuré – SMS non envoyé')
    return
  }
  try {
    // Formater le numéro au format international si nécessaire
    const formattedPhone = phone.startsWith('+') ? phone : `+243${phone.replace(/^0/, '')}`
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: formattedPhone,
    })
    console.log(`SMS envoyé à ${formattedPhone}`)
  } catch (error) {
    console.error('Erreur envoi SMS:', error)
    // On ne bloque pas l'exécution pour un SMS
  }
}

// ---------------------------------------------------------------------------
// Notification interne (base de données)
// ---------------------------------------------------------------------------
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  metadata?: any,
): Promise<void> {
  const supabase = await createClient(true) // service_role pour écrire dans la table notifications
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    metadata: metadata || null,
    read: false,
    created_at: new Date().toISOString(),
  })
  if (error) {
    console.error('Erreur création notification:', error)
    throw new Error('Impossible de créer la notification')
  }
}

// ---------------------------------------------------------------------------
// Notification push (placeholder – à implémenter avec Firebase Admin)
// ---------------------------------------------------------------------------
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  // Implémentation réelle : récupérer les tokens FCM de l'utilisateur depuis une table,
  // puis envoyer via firebase-admin. Pour l'instant, on loggue.
  console.log(`[Push] ${title} – ${body} pour userId ${userId}`)
  // Exemple d'appel Firebase :
  // const tokens = await getFCMTokens(userId)
  // await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, data })
}