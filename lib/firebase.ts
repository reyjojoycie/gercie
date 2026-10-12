// lib/firebase.ts
// ---------------------------------------------------------------------------
// Firebase – Configuration centralisée pour Cloud Messaging (FCM) et Analytics
// ---------------------------------------------------------------------------

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app'
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  Messaging,
} from 'firebase/messaging'
import {
  getAnalytics,
  logEvent,
  Analytics,
  isSupported as isAnalyticsSupported,
} from 'firebase/analytics'

// --------------------- Configuration ---------------------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// ---------------- Initialisation sécurisée ----------------
let app: FirebaseApp | null = null
let messaging: Messaging | null = null
let analytics: Analytics | null = null

if (typeof window !== 'undefined' && firebaseConfig.apiKey) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  } catch (error) {
    console.error('❌ Erreur initialisation Firebase:', error)
  }
}

// ----------- FCM : Messaging (Notifications Push) -----------
if (app) {
  isSupported()
    .then((supported) => {
      if (supported) {
        messaging = getMessaging(app!)
      } else {
        console.warn('🔥 Firebase Messaging non supporté sur ce navigateur.')
      }
    })
    .catch(console.error)
}

// ----------- Analytics (optionnel) -----------
if (app) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app!)
        console.log('📊 Firebase Analytics initialisé')
      }
    })
    .catch(console.error)
}

// ------------------------------------------------------------------
// 1. Demander la permission et obtenir le token FCM
// ------------------------------------------------------------------
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Ce navigateur ne supporte pas les notifications.')
  }
  const permission = await Notification.requestPermission()
  return permission
}

export async function getFCMToken(): Promise<string | null> {
  if (!messaging) {
    console.warn('Firebase Messaging non initialisé.')
    return null
  }

  try {
    // Vérifier que le Service Worker est bien enregistré
    const registration = await navigator.serviceWorker.ready
    const currentToken = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (currentToken) {
      console.log('✅ Token FCM obtenu:', currentToken)
      // Envoyer le token à votre API backend pour l'enregistrer
      await registerTokenOnServer(currentToken)
      return currentToken
    } else {
      console.warn('⚠️ Aucun token FCM disponible.')
      return null
    }
  } catch (error) {
    console.error('❌ Erreur obtention token FCM:', error)
    return null
  }
}

// ------------------------------------------------------------------
// 2. Envoyer le token au serveur pour l'associer à l'utilisateur
// ------------------------------------------------------------------
async function registerTokenOnServer(token: string): Promise<void> {
  try {
    await fetch('/api/notifications/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'web' }),
    })
  } catch (error) {
    console.error('❌ Erreur enregistrement du token sur le serveur:', error)
  }
}

// ------------------------------------------------------------------
// 3. Écouter les messages en premier plan (quand l'app est ouverte)
// ------------------------------------------------------------------
export function onForegroundMessage(callback: (payload: any) => void): void {
  if (!messaging) return
  onMessage(messaging, (payload) => {
    console.log('📬 Message reçu en premier plan:', payload)
    callback(payload)
  })
}

// ------------------------------------------------------------------
// 4. Analytics (exemples d'événements prédéfinis)
// ------------------------------------------------------------------
export function trackPageView(pageTitle: string): void {
  if (!analytics) return
  logEvent(analytics, 'page_view', { page_title: pageTitle })
}

export function trackEvent(
  eventName: string,
  params?: Record<string, any>
): void {
  if (!analytics) return
  logEvent(analytics, eventName, params)
}

export function trackEcommercePurchase(
  transactionId: string,
  value: number,
  currency: string = 'CDF',
  items: Array<{ id: string; name: string; price: number; quantity: number }> = []
): void {
  if (!analytics) return
  logEvent(analytics, 'purchase', {
    transaction_id: transactionId,
    value,
    currency,
    items,
  })
}

// ------------------------------------------------------------------
// 5. Service Worker – À créer dans `public/firebase-messaging-sw.js`
// ------------------------------------------------------------------
// Ce fichier doit être présent dans le dossier public pour que FCM fonctionne.
// Contenu minimal :
/*
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: '...',
  authDomain: '...',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  console.log('Message reçu en arrière-plan:', payload);
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/icons/icon-192.png',
  });
});
*/

// ------------------------------------------------------------------
// 6. Vérifier et enregistrer le Service Worker
// ------------------------------------------------------------------
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker non supporté.')
    return
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    console.log('📦 Service Worker enregistré:', registration.scope)
  } catch (error) {
    console.error('❌ Erreur enregistrement Service Worker:', error)
  }
}

// ------------------------------------------------------------------
// 7. Désenregistrer le token (lors de la déconnexion)
// ------------------------------------------------------------------
export async function deleteFCMToken(): Promise<void> {
  if (!messaging) return
  try {
    const currentToken = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    })
    if (currentToken) {
      // Appeler l'API pour supprimer le token côté serveur
      await fetch('/api/notifications/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken }),
      })
    }
  } catch (error) {
    console.error('❌ Erreur suppression token FCM:', error)
  }
}

// Export de l'app pour d'autres usages si nécessaire
export { app }
