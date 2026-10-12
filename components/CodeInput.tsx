// components/CodeInput.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Key,
  AlertCircle,
  CheckCircle,
  Loader2,
  RotateCcw,
  ClipboardPaste,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface CodeInputProps {
  onValidate: (code: string) => Promise<void> | void
  length?: number
  label?: string
  placeholder?: string
  instruction?: string
  maxAttempts?: number
  variant?: 'client' | 'collect' | 'vendeur' | 'livreur' | 'pin'
  isLoading?: boolean
  className?: string
  onAttemptsExceeded?: () => void
  onCodeChange?: (code: string) => void
}

const configMap = {
  client: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-200 dark:border-amber-800',
    ring: 'focus:ring-amber-500/30',
    text: 'text-amber-800 dark:text-amber-300',
    accent: 'text-amber-600 dark:text-amber-400',
    button: 'warm' as const,
  },
  collect: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    ring: 'focus:ring-blue-500/30',
    text: 'text-blue-800 dark:text-blue-300',
    accent: 'text-blue-600 dark:text-blue-400',
    button: 'brand' as const,
  },
  vendeur: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-200 dark:border-purple-800',
    ring: 'focus:ring-purple-500/30',
    text: 'text-purple-800 dark:text-purple-300',
    accent: 'text-purple-600 dark:text-purple-400',
    button: 'primary' as const,
  },
  livreur: {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-200 dark:border-green-800',
    ring: 'focus:ring-green-500/30',
    text: 'text-green-800 dark:text-green-300',
    accent: 'text-green-600 dark:text-green-400',
    button: 'accent' as const,
  },
  pin: {
    bg: 'bg-red-50 dark:bg-red-950',
    border: 'border-red-200 dark:border-red-800',
    ring: 'focus:ring-red-500/30',
    text: 'text-red-800 dark:text-red-300',
    accent: 'text-red-600 dark:text-red-400',
    button: 'danger' as const,
  },
}

export default function CodeInput({
  onValidate,
  length = 6,
  label = 'Code à 6 chiffres',
  placeholder = 'Entrez le code',
  instruction = 'Demandez le code au client ou au vendeur',
  maxAttempts = 3,
  variant = 'client',
  isLoading = false,
  className = '',
  onAttemptsExceeded,
  onCodeChange,
}: CodeInputProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [validating, setValidating] = useState(false)
  const [pasted, setPasted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const cfg = configMap[variant]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Signaler le code au parent
  useEffect(() => {
    onCodeChange?.(code)
  }, [code, onCodeChange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== length) {
      setError(`Le code doit contenir ${length} chiffres`)
      return
    }
    if (attempts >= maxAttempts) {
      setError(`Trop de tentatives (${maxAttempts} max). Contactez le support.`)
      onAttemptsExceeded?.()
      return
    }
    setValidating(true)
    setError('')
    try {
      await onValidate(code)
      setSuccess(true)
    } catch (err: any) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setError(err.message || 'Code invalide')
      if (newAttempts >= maxAttempts) {
        setError(`Code invalide. Plus de tentatives (${maxAttempts}/${maxAttempts}).`)
        onAttemptsExceeded?.()
      }
      setCode('')
      inputRef.current?.focus()
    } finally {
      setValidating(false)
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, length)
    setCode(val)
    if (error) setError('')
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const digits = text.replace(/\D/g, '').slice(0, length)
      if (digits.length > 0) {
        setCode(digits)
        setPasted(true)
        setTimeout(() => setPasted(false), 2000)
      }
    } catch {}
  }

  const resetInput = () => {
    setCode('')
    setError('')
    setAttempts(0)
    setSuccess(false)
    inputRef.current?.focus()
  }

  const isBlocked = attempts >= maxAttempts && !success
  const isValid = code.length === length && !success && !isBlocked

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-5 sm:p-6 shadow-soft transition-colors',
        error ? 'border-red-500 dark:border-red-400' : cfg.border,
        cfg.bg,
        className
      )}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('p-2 rounded-lg bg-white dark:bg-neutral-800 shadow-sm', cfg.accent)}>
            <Key size={18} />
          </div>
          <div>
            <h3 className={cn('font-bold text-base', cfg.text)}>{label}</h3>
            {attempts > 0 && !success && (
              <Badge variant="danger" size="sm">
                {attempts}/{maxAttempts}
              </Badge>
            )}
            {success && <Badge variant="accent" size="sm">Validé</Badge>}
          </div>
        </div>

        {/* Boutons d'action rapide */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePaste}
            className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            title="Coller depuis le presse-papier"
          >
            <ClipboardPaste size={16} className={cn(pasted ? 'text-accent-500' : 'text-neutral-400')} />
          </button>
          {(attempts > 0 || error) && !success && (
            <button
              type="button"
              onClick={resetInput}
              className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              title="Réinitialiser"
            >
              <RotateCcw size={16} className="text-neutral-400" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Champ de saisie */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          value={code}
          onChange={handleCodeChange}
          placeholder={placeholder}
          disabled={success || isLoading || validating || isBlocked}
          autoComplete="off"
          className={cn(
            'w-full text-center text-2xl sm:text-3xl font-mono font-bold tracking-[0.3em]',
            'px-4 py-3 sm:py-4',
            'rounded-xl border-2',
            'bg-white dark:bg-neutral-900',
            error
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500/30'
              : success
              ? 'border-accent-500 dark:border-accent-400 focus:ring-accent-500/30'
              : 'border-neutral-300 dark:border-neutral-700 focus:ring-brand-500/30',
            'focus:outline-none focus:ring-2',
            'text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'transition-colors'
          )}
        />

        {/* Instruction */}
        {instruction && !success && !isBlocked && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-start gap-1.5">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {instruction}
          </p>
        )}

        {/* Messages d'erreur ou succès */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-xl text-sm">
            <CheckCircle size={16} />
            <span>Code validé avec succès !</span>
          </div>
        )}

        {/* Bouton de validation */}
        {!success && !isBlocked && (
          <Button
            type="submit"
            variant={cfg.button}
            fullWidth
            size="lg"
            disabled={isLoading || validating || !isValid}
            loading={validating || isLoading}
          >
            {validating ? 'Validation...' : 'Valider le code'}
          </Button>
        )}

        {/* Bloqué après trop de tentatives */}
        {isBlocked && (
          <div className="text-center text-sm text-red-600 dark:text-red-400 font-medium">
            ⚠️ Vous avez dépassé le nombre de tentatives. Contactez le service client.
          </div>
        )}
      </form>
    </div>
  )
}
