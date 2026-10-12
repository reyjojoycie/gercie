// components/auth/VerificationCodeInput.tsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VerificationCodeInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  length?: number
  autoFocus?: boolean
  id?: string
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export function VerificationCodeInput({
  value,
  onChange,
  error,
  disabled = false,
  length = 6,
  autoFocus = false,
  id,
}: VerificationCodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() => {
    const vals = value.split('')
    while (vals.length < length) vals.push('')
    return vals.slice(0, length)
  })

  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  /* ---------------------------------------------------------------- */
  /*  Synchroniser avec la valeur externe                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const newDigits = value.split('')
    while (newDigits.length < length) newDigits.push('')
    setDigits(newDigits.slice(0, length))
  }, [value, length])

  /* ---------------------------------------------------------------- */
  /*  AutoFocus sur le premier champ                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (autoFocus && !disabled) {
      // Délai court pour attendre le rendu complet
      const timer = setTimeout(() => {
        inputsRef.current[0]?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [autoFocus, disabled])

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleChange = useCallback(
    (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const char = e.target.value.replace(/[^0-9]/g, '')

      if (char.length > 1) {
        // Collage détecté sur un champ individuel
        const newDigits = [...digits]
        const chars = char.split('')

        for (let i = 0; i < chars.length && index + i < length; i++) {
          newDigits[index + i] = chars[i]
        }

        setDigits(newDigits)
        onChange(newDigits.join(''))

        const lastIndex = Math.min(index + chars.length, length) - 1
        inputsRef.current[lastIndex]?.focus()
        return
      }

      const newDigits = [...digits]
      newDigits[index] = char
      setDigits(newDigits)

      const newValue = newDigits.join('')
      onChange(newValue)

      // Focus automatique sur le champ suivant
      if (char && index < length - 1) {
        inputsRef.current[index + 1]?.focus()
      }
    },
    [digits, length, onChange]
  )

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        // Si le champ est vide, revenir au champ précédent
        inputsRef.current[index - 1]?.focus()
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault()
        inputsRef.current[index - 1]?.focus()
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault()
        inputsRef.current[index + 1]?.focus()
      }
    },
    [digits, length]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()

      const pasted = e.clipboardData
        .getData('text')
        .replace(/[^0-9]/g, '')
        .slice(0, length)

      if (!pasted) return

      const newDigits = pasted.split('')
      while (newDigits.length < length) newDigits.push('')

      setDigits(newDigits)
      onChange(newDigits.join(''))

      // Focus sur le dernier champ rempli
      const lastIndex = Math.min(pasted.length, length) - 1
      inputsRef.current[lastIndex]?.focus()
    },
    [length, onChange]
  )

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Sélectionner le contenu pour faciliter la saisie
      e.target.select()
    },
    []
  )

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex gap-2 justify-center"
        dir="ltr"
        role="group"
        aria-label={`Code de vérification à ${length} chiffres`}
      >
        {Array.from({ length }).map((_, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputsRef.current[idx] = el
            }}
            id={id ? `${id}-${idx}` : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={length}
            value={digits[idx]}
            onChange={(e) => handleChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={idx === 0 ? handlePaste : undefined}
            onFocus={handleFocus}
            disabled={disabled}
            className={cn(
              // Taille généreuse pour les smartphones entrée de gamme
              'w-12 h-14 sm:w-11 sm:h-13 text-center text-xl font-bold',
              'rounded-xl border-2 bg-white dark:bg-midnight-800',
              'text-neutral-900 dark:text-neutral-100',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error
                ? 'border-red-500 dark:border-red-400'
                : 'border-neutral-300 dark:border-neutral-600'
            )}
            aria-label={`Chiffre ${idx + 1} sur ${length}`}
            aria-invalid={error ? true : undefined}
            autoComplete="one-time-code"
          />
        ))}
      </div>

      {error && (
        <p
          className="text-red-500 dark:text-red-400 text-sm flex items-center gap-1"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export default VerificationCodeInput