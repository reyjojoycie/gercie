// components/ai/AiChatWidget.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, MessageCircle, Bot, User, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Faire défiler vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus automatique sur le champ de saisie à l'ouverture
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const newMessage: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, newMessage])
    setInput('')
    setError(null)
    setIsLoading(true)

    try {
      // Préparer l'historique (derniers échanges, max 10 messages)
      const recentHistory = [...messages, newMessage]
        .slice(-10)
        .filter(m => m.role === 'user' || m.role === 'assistant')

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: recentHistory.slice(0, -1), // le dernier message est déjà envoyé comme 'message'
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue')

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre l’assistant.')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-transform duration-300 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          isOpen
            ? 'bg-red-600 text-white rotate-90'
            : 'bg-gradient-to-br from-[#1e293b] to-[#0f172a] text-white'
        }`}
        aria-label={isOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Fenêtre de chat */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[350px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-[#0f172a] dark:ring-white/10 overflow-hidden transition-all duration-300">
          {/* En-tête */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#1e293b] to-[#0f172a] px-5 py-4 text-white">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <span className="font-semibold text-sm">Assistant Gercie</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 hover:bg-white/10 transition-colors"
              aria-label="Fermer le chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[400px] bg-gray-50 dark:bg-[#1e293b]">
            {messages.length === 0 && !isLoading && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
                👋 Bonjour ! Posez-moi une question sur nos produits, les commandes, la livraison…
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 mt-1">
                    <Bot size={18} className="text-blue-600" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white'
                      : 'bg-white dark:bg-[#334155] text-gray-800 dark:text-gray-100 shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 mt-1">
                    <User size={18} className="text-gray-500" />
                  </div>
                )}
              </div>
            ))}

            {/* Indicateur de chargement */}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">L’assistant réfléchit…</span>
              </div>
            )}

            {/* Message d'erreur */}
            {error && (
              <div className="text-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-2">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Zone de saisie */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-[#0f172a]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tapez votre message…"
                disabled={isLoading}
                className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#1e293b] px-4 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Envoyer"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}