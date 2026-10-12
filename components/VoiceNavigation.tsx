// components/VoiceNavigation.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, Command, Navigation, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types pour l'état de la reconnaissance
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

// Commandes vocales disponibles (exemples pour un livreur)
const VOICE_COMMANDS = [
  {
    phrase: 'Prochaine livraison',
    action: 'next_delivery',
    description: 'Naviguer vers la prochaine livraison',
  },
  {
    phrase: 'Carte / afficher la carte',
    action: 'show_map',
    description: 'Afficher la carte de navigation',
  },
  {
    phrase: 'Statistiques',
    action: 'show_stats',
    description: 'Voir mes statistiques',
  },
  {
    phrase: 'Accepter la course',
    action: 'accept_course',
    description: 'Accepter la course actuelle',
  },
  {
    phrase: 'Rafraîchir',
    action: 'refresh',
    description: 'Actualiser la liste des courses',
  },
  {
    phrase: 'Appeler le client',
    action: 'call_client',
    description: 'Appeler le client actuel',
  },
  {
    phrase: 'Livrée',
    action: 'mark_delivered',
    description: 'Marquer la livraison comme terminée',
  },
]

export interface VoiceNavigationProps {
  /** Callback déclenché lorsqu'une commande vocale est reconnue avec succès */
  onCommand?: (action: string, transcript: string) => void
  /** Liste des commandes personnalisées (remplace les commandes par défaut) */
  customCommands?: { phrase: string; action: string; description?: string }[]
  /** Langue utilisée pour la reconnaissance (défaut: 'fr-FR') */
  language?: string
  /** Désactiver le composant */
  disabled?: boolean
  /** Afficher un panneau d'aide avec les commandes disponibles */
  showHelp?: boolean
  /** Classes additionnelles pour le bouton */
  className?: string
}

export function VoiceNavigation({
  onCommand,
  customCommands,
  language = 'fr-FR',
  disabled = false,
  showHelp = true,
  className,
}: VoiceNavigationProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showCommands, setShowCommands] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null)

  const commands = customCommands || VOICE_COMMANDS

  // Initialisation de l'API Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setErrorMessage('Votre navigateur ne supporte pas la reconnaissance vocale.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = language
    recognition.interimResults = true
    recognition.continuous = false // écoute ponctuelle pour éviter les faux déclenchements
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript)
        setInterimTranscript('')
        processCommand(finalTranscript)
      } else {
        setInterimTranscript(interimTranscript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Erreur de reconnaissance vocale:', event.error)
      setState('error')
      setErrorMessage(`Erreur: ${event.error}`)
      setInterimTranscript('')
    }

    recognition.onend = () => {
      if (state === 'listening') {
        // On pourrait redémarrer automatiquement si on veut une écoute continue
        // recognition.start();
        setState('idle')
      }
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [language]) // reconfigure si la langue change

  // Processus de la commande vocale
  const processCommand = useCallback(
    (text: string) => {
      const lowerText = text.toLowerCase().trim()
      setState('processing')

      for (const cmd of commands) {
        const phrases = cmd.phrase.split('/').map(p => p.trim().toLowerCase())
        if (phrases.some(p => lowerText.includes(p))) {
          // Commande trouvée
          if (onCommand) {
            onCommand(cmd.action, text)
          }
          // Feedback vocal (synthèse)
          speak(`Commande "${cmd.description || cmd.action}" exécutée.`)
          return
        }
      }

      // Aucune commande correspondante
      speak("Désolé, je n'ai pas reconnu cette commande.")
      setState('idle')
    },
    [commands, onCommand]
  )

  // Synthèse vocale (Text-to-Speech)
  const speak = (text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    utterance.rate = 1.0
    utterance.pitch = 1.1
    synthesisRef.current = utterance

    utterance.onstart = () => setState('speaking')
    utterance.onend = () => setState('idle')

    window.speechSynthesis.speak(utterance)
  }

  // Démarrer l'écoute
  const startListening = () => {
    if (disabled || !recognitionRef.current) return
    try {
      setTranscript('')
      setInterimTranscript('')
      setErrorMessage('')
      setState('listening')
      recognitionRef.current.start()
    } catch (err) {
      console.error(err)
      setState('error')
      setErrorMessage('Impossible de démarrer le microphone.')
    }
  }

  // Arrêter l'écoute
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setState('idle')
  }

  // Rendu du bouton flottant et de l'interface vocale
  return (
    <div className={cn('relative', className)}>
      {/* Bouton Micro */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={startListening}
        disabled={disabled || state === 'listening' || state === 'processing'}
        className={cn(
          'relative flex items-center justify-center w-14 h-14 rounded-full shadow-strong transition-all',
          state === 'listening' || state === 'processing'
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-gradient-premium text-white hover:shadow-glow',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        title="Commande vocale"
      >
        {state === 'listening' || state === 'processing' ? (
          <MicOff size={24} />
        ) : (
          <Mic size={24} />
        )}
        {state === 'listening' && (
          <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75" />
        )}
      </motion.button>

      {/* État actuel */}
      <AnimatePresence>
        {state === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white dark:bg-neutral-800 rounded-xl shadow-strong p-3 min-w-[200px] text-center border border-neutral-200 dark:border-neutral-700"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Écoute...
              </span>
            </div>
            {interimTranscript && (
              <p className="text-xs text-neutral-500 italic">{interimTranscript}</p>
            )}
          </motion.div>
        )}

        {state === 'processing' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white dark:bg-neutral-800 rounded-xl shadow-strong p-3 min-w-[200px] text-center"
          >
            <p className="text-sm text-brand-600 dark:text-brand-400">
              Analyse en cours...
            </p>
          </motion.div>
        )}

        {state === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white dark:bg-neutral-800 rounded-xl shadow-strong p-3 min-w-[200px] text-center"
          >
            <div className="flex items-center justify-center gap-2">
              <Volume2 className="text-brand-600 dark:text-brand-400" size={16} />
              <span className="text-sm text-brand-700 dark:text-brand-300">Parle...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcription du dernier reconnu */}
      {transcript && state === 'idle' && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white dark:bg-neutral-800 rounded-xl shadow-strong p-2 min-w-[200px] text-center">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">"{transcript}"</p>
        </div>
      )}

      {/* Aide sur les commandes */}
      {showHelp && (
        <div className="absolute -top-1 -right-1">
          <button
            onClick={() => setShowCommands(!showCommands)}
            className="bg-white dark:bg-neutral-800 rounded-full p-1 border border-neutral-200 dark:border-neutral-700 shadow-md hover:shadow-lg transition"
            title="Commandes disponibles"
          >
            <Info size={14} className="text-neutral-500" />
          </button>
        </div>
      )}

      {/* Panneau d'aide */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-20 left-0 w-72 bg-white dark:bg-neutral-900 rounded-2xl shadow-strong border border-neutral-200 dark:border-neutral-700 p-4 z-20"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Command size={14} /> Commandes vocales
              </h3>
              <button onClick={() => setShowCommands(false)}>
                <X size={14} />
              </button>
            </div>
            <ul className="space-y-2 text-xs">
              {commands.map((cmd, idx) => (
                <li key={idx} className="flex justify-between items-center">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    "{cmd.phrase}"
                  </span>
                  <span className="text-neutral-400 dark:text-neutral-500">
                    {cmd.description || cmd.action}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
