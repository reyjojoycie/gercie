// components/ContactButtons.tsx
'use client'

import { Phone, MessageCircle, Copy, Check, Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface ContactButtonsProps {
  phone: string
  /** Affiche aussi un bouton email (si fourni) */
  email?: string
  showCopy?: boolean
  showEmail?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  variant?: 'outline' | 'solid' | 'minimal'
}

export default function ContactButtons({
  phone,
  email,
  showCopy = true,
  showEmail = !!email,
  size = 'md',
  className = '',
  variant = 'outline',
}: ContactButtonsProps) {
  const [copied, setCopied] = useState(false)

  // Formatage du numéro pour WhatsApp (international)
  const formatForWhatsApp = (num: string) => {
    let cleaned = num.replace(/[\s\-()]/g, '').replace(/^\+/, '')
    if (cleaned.startsWith('0')) cleaned = '243' + cleaned.slice(1)
    return cleaned
  }

  const formatForTel = (num: string) => num.replace(/[\s\-()]/g, '')

  const openWhatsApp = () =>
    window.open(`https://wa.me/${formatForWhatsApp(phone)}`, '_blank')

  const openPhone = () => {
    window.location.href = `tel:${formatForTel(phone)}`
  }

  const openEmail = () => {
    if (email) window.location.href = `mailto:${email}`
  }

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phone)
      setCopied(true)
      toast.success('Numéro copié !')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  const btnVariant = variant === 'solid' ? 'primary' : variant === 'minimal' ? 'ghost' : 'outline'

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {/* Appeler */}
      <Button
        variant={btnVariant}
        size={size}
        onClick={openPhone}
        leftIcon={<Phone size={size === 'sm' ? 14 : 16} />}
      >
        <span className="hidden sm:inline">Appeler</span>
      </Button>

      {/* WhatsApp */}
      <Button
        variant={btnVariant}
        size={size}
        onClick={openWhatsApp}
        leftIcon={<MessageCircle size={size === 'sm' ? 14 : 16} />}
        className="border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30"
      >
        <span className="hidden sm:inline">WhatsApp</span>
      </Button>

      {/* Email (optionnel) */}
      {showEmail && email && (
        <Button
          variant={btnVariant}
          size={size}
          onClick={openEmail}
          leftIcon={<Mail size={size === 'sm' ? 14 : 16} />}
        >
          <span className="hidden sm:inline">Email</span>
        </Button>
      )}

      {/* Copier */}
      {showCopy && (
        <Button
          variant={btnVariant}
          size={size}
          onClick={copyPhone}
          leftIcon={copied ? <Check size={size === 'sm' ? 14 : 16} className="text-accent-600" /> : <Copy size={size === 'sm' ? 14 : 16} />}
        >
          <span className="hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
        </Button>
      )}
    </div>
  )
}
