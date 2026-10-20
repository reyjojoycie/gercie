// components/auth/CodeStep.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock, HelpCircle, Loader2, Send, WifiOff } from 'lucide-react'
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput'
import { cn } from '@/lib/utils'

interface CodeStepProps {
  viaSms: boolean
  maskedTarget: string
  value: string
  onChange: (value: string) => void
  busy?: boolean
  hasError?: boolean
  expiresAt: number
  resendAt: number
  onResend: () => void
  resending?: boolean
  devCode?: string | null
  onBack?: () => void
  backLabel?: string
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // ignoré
    }
  }
}

export function CodeStep({
  viaSms,
  maskedTarget,
  value,
  onChange,
  busy = false,
  hasError = false,
  expiresAt,
  resendAt,
  onResend,
  resending = false,
  devCode,
  onBack,
  backLabel,
}: CodeStepProps) {
  const [now, setNow] = useState(() => Date.now())
  const [showTips, setShowTips] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const totalRef = useRef(10 * 60 * 1000)

  // Durée totale du code (pour la barre de progression)
  useEffect(() => {
    const total = expiresAt - Date.now()
    if (total > 0) totalRef.current = total
  }, [expiresAt])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Hors ligne
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(navigator.onLine)
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Vibration sur erreur
  useEffect(() => {
    if (hasError) vibrate([100, 50, 100])
  }, [hasError])

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const timeLeft = Math.max(0, expiresAt - now)
  const expired = expiresAt > 0 && timeLeft === 0
  const progress = Math.max(0, Math.min(100, (timeLeft / totalRef.current) * 100))

  return (
    <div className="space-y-5">
      {!isOnline && (
        <div
          role="alert"
          className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-3 rounded-xl text-sm flex items-center gap-2"
        >
          <WifiOff size={16} className="flex-shrink-0" aria-hidden="true" />
          Vous êtes hors ligne.
        </div>
      )}

      <p className="text-sm text-center text-neutral-600 dark:text-neutral-300">
        Un code à 6 chiffres a été envoyé {viaSms ? 'par SMS au' : 'par email à'}{' '}
        <span className="font-mono font-medium text-neutral-800 dark:text-neutral-100">
          {maskedTarget}
        </span>
        .
      </p>

      <div className="space-y-1" aria-live="polite" aria-atomic="true">
        <div className="flex items-center justify-center gap-1 text-xs text-neutral-500">
          <Clock size={12} aria-hidden="true" />
          {expired ? (
            <span className="text-red-500 font-medium">Code expiré, demandez-en un nouveau</span>
          ) : (
            <>Expire dans {formatTime(timeLeft)}</>
          )}
        </div>
        <div
          className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Temps restant avant expiration du code"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-linear',
              expired ? 'bg-red-500' : progress < 25 ? 'bg-amber-500' : 'bg-gold-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {devCode && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 p-3 rounded-xl text-sm text-center">
          Code de test (dev) : <strong className="font-mono">{devCode}</strong>
        </div>
      )}

      <VerificationCodeInput
        value={value}
        onChange={onChange}
        disabled={busy}
        error={hasError ? 'Code incorrect' : undefined}
        autoFocus
      />

      {busy && (
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-500" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Vérification…
        </div>
      )}

      <div className="text-center space-y-2">
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || resending || busy || !isOnline}
          className="text-sm inline-flex items-center gap-1 text-gold-600 hover:text-gold-500 disabled:text-neutral-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
        >
          {cooldown > 0 ? (
            <>Renvoyer le code dans {cooldown}s</>
          ) : (
            <>
              <Send size={14} aria-hidden="true" /> Renvoyer le code
            </>
          )}
        </button>

        <div>
          <button
            type="button"
            onClick={() => setShowTips((v) => !v)}
            aria-expanded={showTips}
            aria-controls="code-tips"
            className="text-xs text-neutral-400 hover:text-gold-500 inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
          >
            <HelpCircle size={12} aria-hidden="true" />
            {viaSms ? "Je n'ai pas reçu le code" : "Je n'ai pas reçu l'email"}
          </button>
        </div>

        {showTips && (
          <div
            id="code-tips"
            role="region"
            aria-label="Conseils pour recevoir le code"
            className="text-xs text-neutral-600 dark:text-neutral-400 text-left bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-3"
          >
            <ul className="list-disc pl-4 space-y-1">
              {viaSms ? (
                <>
                  <li>Vérifiez que votre téléphone n&apos;est pas en mode avion.</li>
                  <li>Assurez-vous d&apos;avoir une couverture réseau suffisante.</li>
                  <li>Les SMS peuvent prendre jusqu&apos;à 2 minutes sur certains opérateurs.</li>
                  <li>Redémarrez votre téléphone et réessayez.</li>
                </>
              ) : (
                <>
                  <li>
                    Vérifiez votre dossier <strong>spam</strong> ou{' '}
                    <strong>courriers indésirables</strong>.
                  </li>
                  <li>Ajoutez notre adresse à vos contacts.</li>
                  <li>L&apos;email peut prendre jusqu&apos;à 2 minutes selon votre fournisseur.</li>
                  <li>Vérifiez que vous avez saisi la bonne adresse email.</li>
                </>
              )}
            </ul>
          </div>
        )}

        {onBack && (
          <div>
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              className="text-xs inline-flex items-center gap-1 text-neutral-400 hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500 rounded px-2 py-1"
            >
              <ArrowLeft size={12} aria-hidden="true" /> {backLabel ?? 'Retour'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}