// components/PromoCodeInput.tsx
'use client'

import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  Gift,
  Percent,
  Tag,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Clock,
  RefreshCw,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface PromoCodeInputProps {
  /** Taille de l'input et du bouton */
  size?: 'sm' | 'md' | 'lg'
  /** Placeholder personnalisé */
  placeholder?: string
  /** Classe additionnelle */
  className?: string
  /** Désactiver l'input */
  disabled?: boolean
  /** Afficher une liste de codes promo disponibles (suggestions) */
  availableCodes?: { code: string; description: string }[]
  /** Callback après application réussie */
  onApplied?: (code: string) => void
  /** Callback après retrait */
  onRemoved?: () => void
}

/* ========================================================================== */
/*  Composant                                                                  */
/* ========================================================================== */

export function PromoCodeInput({
  size = 'md',
  placeholder = 'Entrez votre code promo',
  className,
  disabled = false,
  availableCodes = [],
  onApplied,
  onRemoved,
}: PromoCodeInputProps) {
  const {
    applyPromoCode,
    removePromoCode,
    activePromo,
    summary,
  } = useCart()
  const toast = useToast()

  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [recentCodes, setRecentCodes] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Appliquer un code passé dans l'URL au montage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('promo')
    if (code && !activePromo) {
      handleApplyCode(code)
    }
  }, [])

  // Charger les derniers codes utilisés depuis sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('gercie-recent-promos')
      if (stored) setRecentCodes(JSON.parse(stored))
    } catch {}
  }, [])

  const saveRecentCode = (code: string) => {
    const updated = [code.toUpperCase(), ...recentCodes.filter(c => c !== code.toUpperCase())].slice(0, 5)
    setRecentCodes(updated)
    sessionStorage.setItem('gercie-recent-promos', JSON.stringify(updated))
  }

  const handleApplyCode = useCallback(
    async (code: string) => {
      if (!code.trim()) return
      setLoading(true)
      setError('')
      try {
        const success = await applyPromoCode(code.trim())
        if (success) {
          setInputValue('')
          saveRecentCode(code.trim())
          onApplied?.(code.trim())
          toast.addToast({
            type: 'success',
            message: `Code « ${code.trim().toUpperCase()} » appliqué !`,
          })
        } else {
          setError('Code invalide ou expiré')
        }
      } catch {
        setError('Erreur lors de la validation')
      } finally {
        setLoading(false)
      }
    },
    [applyPromoCode, onApplied, toast]
  )

  const handleRemoveCode = () => {
    removePromoCode()
    onRemoved?.()
    toast.addToast({ type: 'info', message: 'Code promo retiré' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleApplyCode(inputValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase()
    setInputValue(val)
    setError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // Déclencher validation automatique après 3 caractères (optionnel, on garde le bouton)
    }, 300)
  }

  const totalReduction = summary.remiseTotal
  const sousTotal = summary.sousTotal

  return (
    <div className={cn('space-y-2', className)}>
      {/* Code promo actif */}
      <AnimatePresence>
        {activePromo && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-800/40">
                <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-green-700 dark:text-green-300">
                  {activePromo.code}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {activePromo.type === 'percent'
                    ? `-${activePromo.value}% (max ${activePromo.maxDiscount?.toLocaleString() || '∞'} FC)`
                    : `-${activePromo.value.toLocaleString()} FC`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {totalReduction > 0 && (
                <Badge variant="accent" size="sm">
                  -{totalReduction.toLocaleString()} FC
                </Badge>
              )}
              <Tooltip content="Retirer le code promo">
                <button
                  onClick={handleRemoveCode}
                  className="p-1 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </Tooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formulaire (caché si un code est déjà actif et qu'on ne gère pas l'empilement) */}
      {!activePromo && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            placeholder={placeholder}
            size={size}
            variant="glass"
            className="flex-1 uppercase tracking-wider font-mono"
            disabled={disabled || loading}
            allowClear
            onClear={() => { setInputValue(''); setError('') }}
            error={error}
          />
          <Button
            type="submit"
            variant="outline-gold"
            size={size}
            loading={loading}
            disabled={disabled || !inputValue.trim()}
            leftIcon={<Percent size={16} />}
          >
            Appliquer
          </Button>
        </form>
      )}

      {/* Erreur */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {/* Suggestions (codes disponibles ou récents) */}
      {(availableCodes.length > 0 || recentCodes.length > 0) && !activePromo && (
        <div className="pt-1">
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="text-xs text-gold-600 hover:text-gold-500 flex items-center gap-1"
          >
            <Sparkles size={12} />
            {showSuggestions ? 'Masquer les suggestions' : 'Voir les codes disponibles'}
          </button>
          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-2 space-y-1"
              >
                {availableCodes.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setInputValue(c.code); handleApplyCode(c.code) }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-card border border-border hover:bg-gold-400/10 text-sm flex justify-between items-center"
                  >
                    <div className="flex items-center gap-2">
                      <Gift size={14} className="text-gold-500" />
                      <span className="font-mono font-semibold">{c.code}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                  </button>
                ))}
                {recentCodes.filter(c => !availableCodes.find(a => a.code === c)).map(code => (
                  <button
                    key={code}
                    onClick={() => { setInputValue(code); handleApplyCode(code) }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-card border border-border hover:bg-gold-400/10 text-sm flex items-center gap-2"
                  >
                    <Clock size={14} className="text-muted-foreground" />
                    <span className="font-mono font-semibold">{code}</span>
                    <span className="text-xs text-muted-foreground ml-auto">Récent</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}