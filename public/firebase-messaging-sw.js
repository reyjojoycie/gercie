// public/firebase-messaging-sw.js
// Service Worker Firebase Cloud Messaging pour Gercie
// Gère les notifications push en arrière-plan (PWA)

// Import des scripts Firebase compat (nécessaires dans le worker)
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js')

// ---------- Configuration Firebase (identique à celle du client) ----------
// ⚠️ Remplacez par vos propres valeurs ou utilisez des variables d'environnement
//    (elles ne sont pas accessibles directement dans un Service Worker,
//     vous devez les injecter via un script ou utiliser un objet global)
const firebaseConfig = {
  apiKey: 'AIzaxxxxx',
  authDomain: 'gercie.firebaseapp.com',
  projectId: 'gercie',
  storageBucket: 'gercie.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
}

// Initialisation de Firebase
firebase.initializeApp(firebaseConfig)

// Récupération de l'instance Messaging
const messaging = firebase.messaging()

// ---------- Gestion des messages en arrière-plan ----------
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Message reçu en arrière-plan :', payload)

  const notificationTitle = payload.notification?.title || 'Gercie'
  const notificationOptions = {
    body: payload.notification?.body || 'Vous avez une nouvelle notification.',
    icon: '/icons/icon-192.png', // Icône de la notification
    badge: '/icons/icon-192.png',
    image: payload.notification?.image || undefined,
    data: payload.data || {},
    requireInteraction: true, // La notification reste affichée jusqu'à l'interaction
    tag: payload.data?.notification_id || 'gercie-notification',
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open_url',
        title: 'Voir',
        ...(payload.data?.url ? { url: payload.data.url } : {}),
      },
      {
        action: 'close',
        title: 'Fermer',
      },
    ],
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

// ---------- Gestion des clics sur la notification ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'close') return

  // Par défaut, ouvre l'application sur l'URL contenue dans les données
  const urlToOpen = event.notification.data?.url || '/'

  // Vérifie si une fenêtre correspondante est déjà ouverte
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // Sinon, ouvre une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})

// ---------- Gestion de l'installation du Service Worker ----------
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw] Service Worker installé')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw] Service Worker activé')
  event.waitUntil(clients.claim())
})