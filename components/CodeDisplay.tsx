// components/CodeDisplay.tsx
'use client'

import { useState } from 'react'
import { Copy, Check, CreditCard, Key, Shield, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { motion, AnimatePresence } from 'framer-motion'

interface CodeDisplayProps {
  code: string
  label?: string
  instruction?: string
  variant?: 'client' | 'collect' | 'vendeur' | 'livreur' | 'pin'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  masked?: boolean // masque le code par défaut (pour les PIN)
}

/**
 * Affiche un code de sécurité (livraison, collecte, PIN) avec copie et
 * possibilité de masquer / afficher.
 */
export default function CodeDisplay({
  code,
  label = 'Code de sécurité',
  instruction = 'À partager uniquement avec le livreur',
  variant = 'client',
  className,
  size = 'md',
  masked = variant === 'pin',
}: CodeDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(!masked)

  // Icône et couleurs selon la variante
  const config = {
    client: {
      icon: CreditCard,
      borderColor: 'border-amber-200 dark:border-amber-800',
      bgColor: 'bg-amber-50 dark:bg-amber-950',
      textColor: 'text-amber-800 dark:text-amber-300',
      iconColor: 'text-amber-600 dark:text-amber-400',
      badgeVariant: 'warm' as const,
    },
    collect: {
      icon: Key,
      borderColor: 'border-blue-200 dark:border-blue-800',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      textColor: 'text-blue-800 dark:text-blue-300',
      iconColor: 'text-blue-600 dark:text-blue-400',
      badgeVariant: 'brand' as const,
    },
    vendeur: {
      icon: Shield,
      borderColor: 'border-purple-200 dark:border-purple-800',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      textColor: 'text-purple-800 dark:text-purple-300',
      iconColor: 'text-purple-600 dark:text-purple-400',
      badgeVariant: 'neutral' as const,
    },
    livreur: {
      icon: Key,
      borderColor: 'border-green-200 dark:border-green-800',
      bgColor: 'bg-green-50 dark:bg-green-950',
      textColor: 'text-green-800 dark:text-green-300',
      iconColor: 'text-green-600 dark:text-green-400',
      badgeVariant: 'accent' as const,
    },
    pin: {
      icon: Shield,
      borderColor: 'border-red-200 dark:border-red-800',
      bgColor: 'bg-red-50 dark:bg-red-950',
      textColor: 'text-red-800 dark:text-red-300',
      iconColor: 'text-red-600 dark:text-red-400',
      badgeVariant: 'danger' as const,
    },
  }[variant]

  const Icon = config.icon

  const sizeStyles = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Code copié dans le presse-papier !')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-5 shadow-soft',
        config.borderColor,
        config.bgColor,
        className
      )}
    >
      {/* En-tête avec icône et label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('p-2 rounded-lg bg-white dark:bg-neutral-800 shadow-sm', config.iconColor)}>
            <Icon size={18} />
          </div>
          <div>
            <h3 className={cn('font-bold text-base', config.textColor)}>{label}</h3>
            <Badge variant={config.badgeVariant} size="sm" className="mt-0.5">
              {variant === 'pin' ? 'PIN' : variant === 'collect' ? 'Collecte' : variant === 'vendeur' ? 'Vendeur' : 'Livraison'}
            </Badge>
          </div>
        </div>
        {/* Bouton afficher/masquer */}
        <button
          onClick={() => setVisible(!visible)}
          className="p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          title={visible ? 'Masquer le code' : 'Afficher le code'}
        >
          {visible ? <EyeOff size={16} className="text-neutral-500" /> : <Eye size={16} className="text-neutral-500" />}
        </button>
      </div>

      {/* Code */}
      <div className="flex items-center justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={visible ? 'visible' : 'hidden'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'font-mono font-bold tracking-[0.3em]',
              sizeStyles[size],
              config.textColor,
              !visible && 'tracking-[0.6em]'
            )}
          >
            {visible ? code : '•'.repeat(code.length)}
          </motion.p>
        </AnimatePresence>
        <Button
          variant="outline"
          size="sm"
          onClick={copyToClipboard}
          leftIcon={copied ? <Check size={16} className="text-accent-600" /> : <Copy size={16} />}
        >
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>

      {/* Instruction */}
      {instruction && (
        <div className="mt-3 pt-3 border-t border-neutral-200/50 dark:border-neutral-700/50">
          <p className={cn('text-xs text-neutral-600 dark:text-neutral-400')}>{instruction}</p>
        </div>
      )}
    </div>
  )
}
