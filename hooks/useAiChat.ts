// hooks/useAiChat.ts
'use client'

import { useState, useCallback } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Envoyer un message utilisateur et récupérer la réponse de l'assistant
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return

    const newMessage: ChatMessage = { role: 'user', content: userMessage.trim() }
    setMessages(prev => [...prev, newMessage])
    setError(null)
    setIsLoading(true)

    try {
      // On prépare l'historique des 10 derniers messages (sans le tout dernier ajouté)
      const recentHistory = [...messages, newMessage]
        .slice(-10)
        .filter(m => m.role === 'user' || m.role === 'assistant')

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.trim(),
          history: recentHistory.slice(0, -1), // le dernier message est déjà passé comme 'message'
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue')

      const assistantMessage: ChatMessage = { role: 'assistant', content: data.response }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err: any) {
      setError(err.message || 'Impossible de contacter l’assistant.')
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading])

  // Vider l'historique
  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // Remplacer l'historique (utile pour restaurer une conversation)
  const replaceMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    replaceMessages,
  }
}