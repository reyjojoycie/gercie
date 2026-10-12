// app/api/notifications/push/send/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
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
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin ou autorisé (selon votre logique)
  const supabase = await createClient(true)
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    // Pour les notifications automatiques (ex: commande livrée), on pourrait autoriser le système
    // Ici on exige admin pour l'appel direct
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Valider les données
  const rawBody = await request.json()
  const parsed = sendSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { userId, title, body, data } = parsed.data

  try {
    // Récupérer les tokens FCM actifs de l'utilisateur
    const { data: tokens, error: tokenError } = await supabase
      .from('livreur_notification_tokens')
      .select('token')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (tokenError || !tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'Aucun token de notification trouvé pour cet utilisateur' }, { status: 404 })
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

    return NextResponse.json({ success: true, successCount: response.successCount, failureCount: response.failureCount })
  } catch (error: any) {
    console.error('Erreur envoi notification push:', error)
    return NextResponse.json({ error: 'Erreur lors de l’envoi de la notification' }, { status: 500 })
  }
}
