// hooks/usePushNotifications.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from 'firebase/messaging'

// Initialisation du messaging (doit être appelé une fois que Firebase est initialisé)
let messagingInstance: Messaging | null = null

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance
  const supported = await isSupported()
  if (!supported) return null
  try {
    const { app } = await import('@/lib/firebase')
    messagingInstance = getMessaging(app)
    return messagingInstance
  } catch {
    return null
  }
}

export interface UsePushNotificationsReturn {
  /** Le navigateur supporte les notifications push */
  isSupported: boolean
  /** Permission actuelle : 'granted', 'denied', 'prompt', 'unsupported' */
  permission: NotificationPermission | 'unsupported'
  /** Token FCM pour l'envoi de notifications */
  token: string | null
  /** Demande la permission et enregistre le token sur le serveur */
  requestPermission: () => Promise<boolean>
  /** Supprime le token et se désabonne (déconnexion) */
  unregister: () => Promise<void>
  /** Dernier message reçu en premier plan */
  foregroundMessage: any | null
  /** Indique si une opération est en cours */
  loading: boolean
  /** Erreur éventuelle */
  error: string | null
}

/**
 * Hook pour gérer les notifications push via Firebase Cloud Messaging.
 *
 * @example
 * const { permission, requestPermission, token } = usePushNotifications()
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth()
  const [isSupportedState, setIsSupportedState] = useState<boolean>(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [token, setToken] = useState<string | null>(null)
  const [foregroundMessage, setForegroundMessage] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const permissionRequested = useRef(false)

  // Vérifie le support et la permission actuelle
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const supported = await isSupported()
        if (!supported) {
          setIsSupportedState(false)
          setPermission('unsupported')
          return
        }
        setIsSupportedState(true)
        if ('Notification' in window) {
          setPermission(Notification.permission)
        } else {
          setPermission('unsupported')
        }
      } catch {
        setIsSupportedState(false)
        setPermission('unsupported')
      }
    }
    checkSupport()
  }, [])

  // Récupère le token existant si la permission est déjà accordée
  useEffect(() => {
    if (permission !== 'granted' || !user) return
    const fetchToken = async () => {
      try {
        const messaging = await getMessagingInstance()
        if (!messaging) return
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        })
        if (currentToken) {
          setToken(currentToken)
          // Enregistrer le token sur le serveur (optionnel, mais bon pour la synchronisation)
          await fetch('/api/notifications/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentToken, platform: 'web' }),
          })
        }
      } catch (err) {
        console.error('Erreur récupération token existant:', err)
      }
    }
    fetchToken()
  }, [permission, user])

  // Écoute des messages en premier plan
  useEffect(() => {
    if (permission !== 'granted') return
    let unsubscribe: (() => void) | undefined
    const setupForegroundListener = async () => {
      const messaging = await getMessagingInstance()
      if (!messaging) return
      unsubscribe = onMessage(messaging, (payload) => {
        setForegroundMessage(payload)
      })
    }
    setupForegroundListener()
    return () => {
      unsubscribe?.()
    }
  }, [permission])

  // Demander la permission et enregistrer le token
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications non supportées')
      }
      // Demander la permission
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setLoading(false)
        return false
      }
      // Obtenir le token
      const messaging = await getMessagingInstance()
      if (!messaging) throw new Error('Firebase Messaging non initialisé')
      const currentToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      })
      if (!currentToken) {
        throw new Error('Impossible d’obtenir le token')
      }
      setToken(currentToken)
      // Enregistrer sur le serveur
      const res = await fetch('/api/notifications/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken, platform: 'web' }),
      })
      if (!res.ok) {
        console.warn('Enregistrement du token échoué sur le serveur')
      }
      permissionRequested.current = true
      setLoading(false)
      return true
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la demande de permission')
      setLoading(false)
      return false
    }
  }, [])

  // Désabonnement et suppression du token
  const unregister = useCallback(async () => {
    setLoading(true)
    try {
      const messaging = await getMessagingInstance()
      if (!messaging || !token) return
      // Supprimer le token localement
      await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY }) // option : on pourrait le supprimer côté serveur seulement
      // Envoyer la demande de désinscription
      await fetch('/api/notifications/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setToken(null)
      setPermission('prompt') // ou on pourrait garder 'denied' ?
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la désinscription')
    } finally {
      setLoading(false)
    }
  }, [token])

  return {
    isSupported: isSupportedState,
    permission,
    token,
    requestPermission,
    unregister,
    foregroundMessage,
    loading,
    error,
  }
}
