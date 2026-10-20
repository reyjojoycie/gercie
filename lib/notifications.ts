import { z } from 'zod'
import logger from './logger'
import { createClient } from '@/lib/supabaseServer'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// 1. Types et validation
// ---------------------------------------------------------------------------
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app'

export interface NotificationPayload {
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
  channels?: NotificationChannel[]
}

export const notificationPayloadSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.record(z.unknown()).optional(),
  channels: z.array(z.enum(['email', 'sms', 'push', 'in_app'])).optional(),
})

export type NotificationLogStatus = 'pending' | 'sent' | 'failed' | 'rate_limited'

export interface NotificationLogEntry {
  id: string
  userId: string
  channel: NotificationChannel
  type: string
  status: NotificationLogStatus
  timestamp: string
  error?: string
}

// ---------------------------------------------------------------------------
// 2. Classe NotificationService
// ---------------------------------------------------------------------------
class NotificationService {
  private emailEnabled = !!process.env.RESEND_API_KEY
  private smsEnabled = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  private pushEnabled = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  private inAppEnabled = true

  async send(userId: string, payload: Omit<NotificationPayload, 'userId'>): Promise<NotificationLogEntry[]> {
    const fullPayload: NotificationPayload = { userId, ...payload }
    const parsed = notificationPayloadSchema.safeParse(fullPayload)
    if (!parsed.success) throw new Error(`Payload invalide: ${parsed.error.message}`)
    
    const { userId: uid, type, title, body, data, channels: forcedChannels } = parsed.data
    const channels = forcedChannels ?? await this.getUserPreferredChannels(uid)

    const entries: NotificationLogEntry[] = []
    const promises = channels.map(async (channel) => {
      const entry: NotificationLogEntry = {
        id: uuidv4(), userId: uid, channel, type, status: 'pending', timestamp: new Date().toISOString()
      }
      entries.push(entry)
      try {
        await this.sendViaChannel(channel, uid, { type, title, body, data })
        entry.status = 'sent'
      } catch (err: any) {
        entry.status = 'failed'
        entry.error = err.message
        logger.error(`Notification ${channel} échouée pour ${uid}`, err)
      }
    })

    await Promise.allSettled(promises)
    return entries
  }

  private async sendViaChannel(channel: NotificationChannel, userId: string, content: any) {
    switch (channel) {
      case 'email': return this.sendEmail(userId, content)
      case 'sms': return this.sendSMS(userId, content)
      case 'push': return this.sendPush(userId, content)
      case 'in_app': return this.sendInApp(userId, content)
    }
  }

  private async sendEmail(userId: string, content: any) { /* Logique Resend */ }
  private async sendSMS(userId: string, content: any) { /* Logique Twilio */ }
  private async sendPush(userId: string, content: any) { /* Logique FCM */ }
  private async sendInApp(userId: string, content: any) {
    const supabase = await createClient()
    await supabase.from('notifications').insert({ user_id: userId, titre: content.title, message: content.body, lue: false })
  }

  private async getUserPreferredChannels(userId: string): Promise<NotificationChannel[]> {
    return ['in_app']
  }
  
  async sendAdminNotification(payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> }) {
    const adminId = '00000000-0000-0000-0000-000000000000'
    return this.send(adminId, { type: payload.type, title: payload.title, body: payload.message, data: payload.metadata, channels: ['email', 'in_app'] })
  }
}

// ---------------------------------------------------------------------------
// 3. Singleton et Exports Explicites
// ---------------------------------------------------------------------------
const notificationService = new NotificationService()

export async function sendNotification(
  userId: string,
  payload: { type: string; title: string; body: string; data?: Record<string, unknown> }
) {
  return notificationService.send(userId, payload)
}

export const createNotification = sendNotification

export async function sendAdminNotification(payload: {
  type: string
  title: string
  message: string
  metadata?: Record<string, unknown>
}) {
  return notificationService.sendAdminNotification(payload)
}

export async function sendEmail(to: string, subject: string, body: string) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('id').eq('email', to).single()
  if (profile?.id) {
    await sendNotification(profile.id, { type: 'email_compat', title: subject, body, channels: ['email'] })
  }
}

export async function sendSMS(to: string, text: string) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('id').eq('telephone', to).single()
  if (profile?.id) {
    await sendNotification(profile.id, { type: 'sms_compat', title: '', body: text, channels: ['sms'] })
  }
}

// L'UNIQUE export par défaut est ici, tout à la fin.
export default notificationService