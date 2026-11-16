// app/api/notifications/push/send/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdminApi } from '@/lib/auth/adminGuard'
import { successResponse, errorResponse, validationErrorResponse } from '@/lib/api-response'
import { z } from 'zod'
import admin from 'firebase-admin'

// Initialisation Firebase Admin (à faire une seule fois)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
    console.log('✅ Firebase Admin initialisé')
  } catch (err) {
    console.error('❌ Erreur initialisation Firebase Admin:', err)
  }
}

// Schéma de validation
const sendSchema = z.object({
  userId: z.string().uuid('ID utilisateur invalide'),
  title: z.string().min(1, 'Titre requis').max(100),
  body: z.string().min(1, 'Corps du message requis').max(500),
  data: z.record(z.string()).optional(),
})

export async function POST(request: Request) {
  const { error: authError } = await requireAdminApi()
  if (authError) return authError

  let rawBody: any
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse('Corps JSON invalide', 400)
  }

  const parsed = sendSchema.safeParse(rawBody)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { userId, title, body, data } = parsed.data

  try {
    const supabase = await createClient(true)
    // Récupérer les tokens FCM actifs de l'utilisateur
    const { data: tokens, error: tokenError } = await supabase
      .from('livreur_notification_tokens')
      .select('token')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (tokenError || !tokens || tokens.length === 0) {
      return errorResponse('Aucun token de notification trouvé pour cet utilisateur', 404)
    }

    const fcmTokens = tokens.map(t => t.token)

    // Envoyer la notification via Firebase Cloud Messaging
    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title,
        body,
      },
      data: data ?? {},
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_notification',
          color: '#c9a962',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    }

    const response = await admin.messaging().sendEachForMulticast(message)
    console.log(`📬 Notification push envoyée : ${response.successCount} succès, ${response.failureCount} échecs`)

    // Optionnel : désactiver les tokens invalides
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === 'messaging/invalid-registration-token') {
          supabase
            .from('livreur_notification_tokens')
            .update({ is_active: false })
            .eq('token', fcmTokens[idx])
            .then(() => {})
        }
      })
    }

    return successResponse({
      successCount: response.successCount,
      failureCount: response.failureCount,
    })
  } catch (error: any) {
    console.error('Erreur envoi notification push:', error)
    return errorResponse('Erreur lors de l’envoi de la notification', 500)
  }
}
