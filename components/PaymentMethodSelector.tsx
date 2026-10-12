// components/PaymentMethodSelector.tsx
'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef, forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import {
  Wallet,
  Smartphone,
  CreditCard,
  Landmark,
  ShieldCheck,
  Lock,
  Clock,
  Star,
  Zap,
  Gift,
  Info,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export type PaymentMethod = 'wallet' | 'orange' | 'airtel' | 'mpesa' | 'card'

export interface PaymentMethodOption {
  id: PaymentMethod
  label: string
  description: string
  icon: React.ReactNode
  colorClass: string   // classe Tailwind pour la couleur dominante
  disabled?: boolean
  disabledReason?: string
  badge?: string
  extraFields?: boolean   // si true, affiche un champ numéro de téléphone
  logoUrl?: string
}

interface PaymentMethodSelectorProps {
  /** Méthode sélectionnée (contrôlé) */
  value?: PaymentMethod
  /** Callback lors du changement */
  onChange?: (method: PaymentMethod) => void
  /** Afficher les détails de sécurité */
  showSecurityInfo?: boolean
  /** Afficher le solde wallet */
  showWalletBalance?: boolean
  /** Montant total à payer (pour comparaison solde) */
  totalAmount?: number
  /** Devise utilisée */
  currency?: 'CDF' | 'USD'
  /** Numéro de téléphone pour les méthodes mobiles (contrôlé) */
  phoneNumber?: string
  onPhoneNumberChange?: (phone: string) => void
  /** Afficher le champ téléphone directement */
  showPhoneInput?: boolean
  /** Classe additionnelle */
  className?: string
  /** Désactiver tout le sélecteur */
  disabled?: boolean
}

/* ========================================================================== */
/*  Configuration des options                                                  */
/* ========================================================================== */

const defaultOptions: PaymentMethodOption[] = [
  {
    id: 'wallet',
    label: 'Portefeuille Gercie',
    description: 'Payez instantanément avec votre solde achat.',
    icon: <Wallet size={24} />,
    colorClass: 'text-gold-500 border-gold-400 bg-gold-50 dark:bg-gold-900/20',
  },
  {
    id: 'orange',
    label: 'Orange Money',
    description: 'Paiement mobile via votre compte Orange.',
    icon: <Smartphone size={24} />,
    colorClass: 'text-orange-500 border-orange-400 bg-orange-50 dark:bg-orange-900/20',
    extraFields: true,
  },
  {
    id: 'airtel',
    label: 'Airtel Money',
    description: 'Paiement mobile via Airtel.',
    icon: <Smartphone size={24} />,
    colorClass: 'text-red-500 border-red-400 bg-red-50 dark:bg-red-900/20',
    extraFields: true,
  },
  {
    id: 'mpesa',
    label: 'M-Pesa',
    description: 'Paiement mobile via M-Pesa.',
    icon: <Smartphone size={24} />,
    colorClass: 'text-green-500 border-green-400 bg-green-50 dark:bg-green-900/20',
    extraFields: true,
  },
  {
    id: 'card',
    label: 'Carte bancaire',
    description: 'Visa, Mastercard (bientôt disponible).',
    icon: <CreditCard size={24} />,
    colorClass: 'text-blue-500 border-blue-400 bg-blue-50 dark:bg-blue-900/20',
    disabled: true, // simulation
    disabledReason: 'Fonctionnalité à venir',
  },
]

/* ========================================================================== */
/*  Composant PaymentMethodSelector                                            */
/* ========================================================================== */

export function PaymentMethodSelector({
  value: controlledValue,
  onChange,
  showSecurityInfo = true,
  showWalletBalance = true,
  totalAmount = 0,
  currency = 'CDF',
  phoneNumber: controlledPhone,
  onPhoneNumberChange,
  showPhoneInput = false,
  className,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const { user } = useAuth()
  const toast = useToast()
  const { rate } = useExchangeRate()

  // État interne si non contrôlé
  const [internalValue, setInternalValue] = useState<PaymentMethod>('wallet')
  const selectedMethod = controlledValue ?? internalValue

  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Chargement du solde wallet si option activée
  useEffect(() => {
    if (showWalletBalance && user) {
      setLoadingBalance(true)
      fetch('/api/user/wallet')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setWalletBalance(data.solde_achat ?? 0))
        .catch(() => setWalletBalance(0))
        .finally(() => setLoadingBalance(false))
    }
  }, [showWalletBalance, user])

  const handleSelect = useCallback(
    (method: PaymentMethod) => {
      if (disabled) return
      const option = defaultOptions.find(o => o.id === method)
      if (option?.disabled) {
        toast.addToast({ type: 'warning', message: option.disabledReason || 'Méthode indisponible' })
        return
      }
      if (controlledValue === undefined) setInternalValue(method)
      onChange?.(method)
    },
    [controlledValue, onChange, disabled, toast]
  )

  const selectedOption = useMemo(
    () => defaultOptions.find(o => o.id === selectedMethod),
    [selectedMethod]
  )

  const isWallet = selectedMethod === 'wallet'
  const isMobile = ['orange', 'airtel', 'mpesa'].includes(selectedMethod)

  // Solde insuffisant pour wallet
  const soldeInsuffisant = isWallet && walletBalance !== null && walletBalance < totalAmount

  return (
    <div className={cn('space-y-4', className)}>
      {/* Grille des options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {defaultOptions.map(option => {
          const isActive = selectedMethod === option.id
          return (
            <motion.button
              key={option.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(option.id)}
              disabled={disabled || option.disabled}
              className={cn(
                'relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left cursor-pointer',
                isActive
                  ? `${option.colorClass} shadow-md scale-[1.02]`
                  : 'border-border hover:border-gold-400/50 hover:bg-gold-400/5',
                option.disabled && 'opacity-60 cursor-not-allowed',
              )}
              aria-pressed={isActive}
            >
              {/* Icône */}
              <div className={cn('p-3 rounded-full', isActive ? 'bg-current/10' : 'bg-muted')}>
                {option.icon}
              </div>

              {/* Label */}
              <div className="text-center">
                <p className="font-semibold text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
              </div>

              {/* Badge indisponible */}
              {option.disabled && option.disabledReason && (
                <Badge variant="neutral" size="sm" className="absolute top-2 right-2">
                  <Clock size={12} className="mr-1" /> Bientôt
                </Badge>
              )}

              {/* Cocher actif */}
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-6 h-6 bg-gold-500 rounded-full flex items-center justify-center"
                >
                  <CheckCircle2 size={14} className="text-white" />
                </motion.div>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Affichage conditionnel : solde wallet */}
      {isWallet && showWalletBalance && (
        <div className="mt-4 p-4 rounded-xl bg-card border border-border">
          {loadingBalance ? (
            <Spinner size="sm" />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Votre solde achat</p>
                <p className="text-2xl font-bold text-gold-600">
                  {walletBalance?.toLocaleString() ?? '---'} FC
                </p>
                {rate && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {((walletBalance ?? 0) / rate).toFixed(2)} USD
                  </p>
                )}
              </div>
              <Wallet size={32} className="text-gold-500" />
            </div>
          )}
          {soldeInsuffisant && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-red-600 text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>
                Solde insuffisant. Il manque{' '}
                {((walletBalance ?? 0) - totalAmount > 0 ? 0 : totalAmount - (walletBalance ?? 0)).toLocaleString()} FC.
              </span>
              <a href="/profile/recharge" className="underline font-medium hover:text-red-400 ml-auto">
                Recharger
              </a>
            </div>
          )}
        </div>
      )}

      {/* Champ téléphone pour mobile money */}
      {isMobile && showPhoneInput && (
        <div className="mt-4">
          <Input
            label="Numéro de téléphone"
            type="tel"
            placeholder="0812345678"
            value={controlledPhone}
            onChange={e => onPhoneNumberChange?.(e.target.value)}
            variant="glass"
            size="md"
            helperText="Format : 10 chiffres commençant par 0"
          />
        </div>
      )}

      {/* Informations de sécurité */}
      {showSecurityInfo && (
        <div className="mt-4 p-4 rounded-xl bg-card border border-border space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <ShieldCheck size={16} className="text-gold-500" /> Sécurité garantie
          </h4>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-gold-500" /> Cryptage SSL 256-bit
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-gold-500" /> Protection acheteur
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-gold-500" /> Transaction instantanée
            </div>
            <div className="flex items-center gap-2">
              <Star size={14} className="text-gold-500" /> Données bancaires non stockées
            </div>
          </div>
        </div>
      )}
    </div>
  )
}