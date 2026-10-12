// components/ChatBot.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, X, Send, Sparkles, Bot, User,
  Loader2, ThumbsUp, ThumbsDown, HelpCircle, ChevronRight, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useAiChat, type ChatMessage } from '@/hooks/useAiChat'

const SUGGESTIONS = [
  "Comment suivre ma commande ?",
  "Quels sont les modes de paiement ?",
  "Comment devenir vendeur ?",
  "Quels sont les délais de livraison ?",
  "Comment retourner un article ?",
]

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Utilisation du hook IA
  const { messages, isLoading, error, sendMessage, clearMessages } = useAiChat()

  // Message de bienvenue (affiché uniquement si aucun message)
  const welcomeMessage: ChatMessage = {
    role: 'assistant',
    content: "Bonjour ! Je suis l'assistant Gercie. Comment puis‑je vous aider aujourd'hui ?",
  }

  const displayMessages = messages.length === 0 && !isLoading
    ? [welcomeMessage]
    : messages

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages, isLoading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return
    await sendMessage(inputValue.trim())
    setInputValue('')
  }, [inputValue, isLoading, sendMessage])

  const handleSuggestion = (text: string) => {
    sendMessage(text)
    setShowSuggestions(false)
  }

  const handleFeedback = (msgContent: string, type: 'up' | 'down') => {
    // Stocke le feedback localement (lié au contenu du message)
    setFeedbackMap(prev => ({
      ...prev,
      [msgContent]: prev[msgContent] === type ? undefined : type,
    }))
    // Ici, vous pourriez envoyer le feedback à une API dédiée
  }

  const toggleChat = () => setIsOpen(prev => !prev)

  // Indicateur de frappe
  const typingIndicator = (
    <div className="flex justify-start">
      <div className="bg-white/80 dark:bg-midnight-800/60 backdrop-blur-md border border-gold-400/20 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gold-400 animate-bounce [animation-delay:0s]" />
          <div className="w-2 h-2 rounded-full bg-gold-400 animate-bounce [animation-delay:0.2s]" />
          <div className="w-2 h-2 rounded-full bg-gold-400 animate-bounce [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Bouton flottant premium */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={toggleChat}
            className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-900 rounded-full p-4 shadow-gold hover:shadow-glow-gold transition-all duration-300 hover:scale-110"
            aria-label="Ouvrir le chat d'assistance"
          >
            <MessageCircle size={24} />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-burgundy-500 rounded-full border-2 border-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Fenêtre de chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-20 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] max-h-[600px] h-[600px] bg-white/90 dark:bg-midnight-900/90 backdrop-blur-xl rounded-2xl shadow-strong border border-gold-400/30 dark:border-gold-400/20 overflow-hidden flex flex-col"
          >
            {/* En-tête */}
            <div className="bg-gradient-to-r from-gold-500 to-burgundy-700 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    Assistant Gercie
                    <span className="inline-flex items-center gap-0.5 bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full">
                      <Sparkles size={10} className="text-amber-300" />
                      IA
                    </span>
                  </h3>
                  <p className="text-xs text-white/70">En ligne</p>
                </div>
              </div>
              <button
                onClick={toggleChat}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/80 dark:bg-midnight-950/80">
              {displayMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-midnight-900 rounded-br-md shadow-gold'
                        : 'bg-white/80 dark:bg-midnight-800/60 backdrop-blur-md text-neutral-800 dark:text-neutral-200 border border-gold-400/20 rounded-bl-md shadow-soft'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="gold" size="sm" className="bg-gold-100 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300">
                          <Bot size={10} className="mr-1" /> Assistant
                        </Badge>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gold-400/20">
                        <button
                          onClick={() => handleFeedback(msg.content, 'up')}
                          className={cn(
                            'p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition',
                            feedbackMap[msg.content] === 'up' && 'text-green-500'
                          )}
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.content, 'down')}
                          className={cn(
                            'p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition',
                            feedbackMap[msg.content] === 'down' && 'text-red-500'
                          )}
                        >
                          <ThumbsDown size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Indicateur de frappe */}
              {isLoading && typingIndicator}

              {/* Erreur */}
              {error && (
                <div className="flex justify-start">
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl px-4 py-3 text-sm">
                    <p className="flex items-center gap-2">
                      <HelpCircle size={14} />
                      {error}
                    </p>
                    <button
                      onClick={() => sendMessage(inputValue)}
                      className="mt-2 text-xs underline hover:no-underline"
                    >
                      Réessayer
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions rapides */}
            {displayMessages.length <= 1 && !isLoading && (
              <div className="px-4 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-neutral-400">Questions fréquentes</p>
                  <button
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    className="text-xs text-gold-600 hover:text-gold-500 flex items-center gap-1"
                  >
                    {showSuggestions ? 'Masquer' : 'Afficher'} <ChevronRight size={10} className={showSuggestions ? 'rotate-90' : ''} />
                  </button>
                </div>
                {showSuggestions && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => handleSuggestion(suggestion)}
                        className="text-xs bg-white/80 dark:bg-midnight-800/60 backdrop-blur-sm border border-gold-400/20 rounded-full px-3 py-1.5 hover:bg-gold-50 dark:hover:bg-gold-900/20 hover:border-gold-400/50 transition text-neutral-600 dark:text-neutral-300"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Barre de saisie */}
            <form onSubmit={handleSubmit} className="border-t border-gold-400/20 p-3 bg-white/80 dark:bg-midnight-800/60 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Tapez votre message..."
                  className="flex-1 bg-neutral-100/80 dark:bg-midnight-700/50 border-gold-400/20 rounded-xl"
                  inputSize="sm"
                  disabled={isLoading}
                  variant="glass"
                />
                <Button
                  type="submit"
                  variant="luxe"
                  size="icon"
                  disabled={isLoading || !inputValue.trim()}
                  className="rounded-xl"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}