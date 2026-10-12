// components/ShareModal.tsx
'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import {
  Copy,
  Check,
  Link as LinkIcon,
  Share2,
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  Mail,
  Send,
  QrCode,
  Smartphone,
  ExternalLink,
} from 'lucide-react'

/* ========================================================================
   Types
   ======================================================================== */
interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  /** URL à partager (par défaut : window.location.href) */
  url?: string
  /** Titre (utilisé pour les réseaux sociaux) */
  title?: string
  /** Description (utilisé pour les réseaux sociaux) */
  description?: string
  /** Image pour l'Open Graph (optionnelle) */
  image?: string
  /** Callback lorsque l'utilisateur effectue un partage */
  onShare?: (platform: string) => void
}

/* ========================================================================
   Helpers internes
   ======================================================================== */

// URL encodee pour les réseaux sociaux
const encode = (s: string) => encodeURIComponent(s)

// Génération d'un QR code via une API externe (aucune dépendance)
const getQrCodeUrl = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encode(url)}`

/* ========================================================================
   Composant
   ======================================================================== */
export default function ShareModal({
  isOpen,
  onClose,
  url: customUrl,
  title = 'Découvrez ceci sur Gercie',
  description = '',
  image = '',
  onShare,
}: ShareModalProps) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const url =
    customUrl ||
    (typeof window !== 'undefined'
      ? window.location.href
      : 'https://gercie.cd')

  // Construire les liens de partage
  const shareLinks = useMemo(
    () => ({
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encode(url)}&text=${encode(title)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`,
      whatsapp: `https://wa.me/?text=${encode(title + ' ' + url)}`,
      telegram: `https://t.me/share/url?url=${encode(url)}&text=${encode(title)}`,
      email: `mailto:?subject=${encode(title)}&body=${encode(description + '\n\n' + url)}`,
    }),
    [url, title, description]
  )

  // Copie du lien
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.addToast({
        type: 'success',
        message: 'Lien copié dans le presse-papier',
        duration: 2000,
      })
      setTimeout(() => setCopied(false), 2000)
      onShare?.('copy')
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: 'Impossible de copier le lien',
      })
    }
  }, [url, toast, onShare])

  // Partage natif (mobile)
  const nativeShare = useCallback(async () => {
    if (!navigator.share) return
    try {
      await navigator.share({
        title,
        text: description,
        url,
      })
      onShare?.('native')
    } catch (err) {
      // L'utilisateur a annulé ou erreur
    }
  }, [title, description, url, onShare])

  // Boutons sociaux
  const socialButtons = [
    {
      label: 'Facebook',
      icon: <Facebook size={20} className="text-blue-600" />,
      href: shareLinks.facebook,
    },
    {
      label: 'Twitter / X',
      icon: <Twitter size={20} className="text-blue-400" />,
      href: shareLinks.twitter,
    },
    {
      label: 'LinkedIn',
      icon: <Linkedin size={20} className="text-blue-700" />,
      href: shareLinks.linkedin,
    },
    {
      label: 'WhatsApp',
      icon: <MessageCircle size={20} className="text-green-500" />,
      href: shareLinks.whatsapp,
    },
    {
      label: 'Telegram',
      icon: <Send size={20} className="text-blue-500" />,
      href: shareLinks.telegram,
    },
    {
      label: 'Email',
      icon: <Mail size={20} className="text-neutral-600 dark:text-neutral-300" />,
      href: shareLinks.email,
    },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Partager"
      size="lg"
      accent="gold"
      showCloseButton
      bodyClassName="py-6"
      footer={
        <Button variant="outline-gold" size="sm" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-8">
        {/* Section liens sociaux */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Share2 size={16} /> Réseaux sociaux
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {socialButtons.map((btn) => (
              <Tooltip key={btn.label} content={btn.label}>
                <a
                  href={btn.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onShare?.(btn.label.toLowerCase())}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-midnight-800 transition-colors group"
                >
                  <div className="p-3 rounded-full bg-neutral-100 dark:bg-midnight-700 group-hover:scale-110 transition-transform">
                    {btn.icon}
                  </div>
                  <span className="text-xs text-muted-foreground">{btn.label}</span>
                </a>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Section lien direct + copie */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <LinkIcon size={16} /> Lien direct
          </h4>
          <div className="flex gap-2">
            <Input
              type="text"
              value={url}
              readOnly
              className="flex-1 bg-neutral-100 dark:bg-midnight-800 text-sm"
            />
            <Button
              variant={copied ? 'accent' : 'outline-gold'}
              size="md"
              onClick={copyToClipboard}
              leftIcon={copied ? <Check size={16} /> : <Copy size={16} />}
            >
              {copied ? 'Copié' : 'Copier'}
            </Button>
          </div>
        </div>

        {/* Section QR Code */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <QrCode size={16} /> QR Code
          </h4>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-3 rounded-2xl shadow-soft">
              <img
                src={getQrCodeUrl(url)}
                alt="QR Code"
                width={180}
                height={180}
                className="rounded-lg"
                onError={(e) => {
                  // Si l'API externe échoue, masquer l'image
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir le lien
            </p>
          </div>
        </div>

        {/* Partage natif (mobile) */}
        {typeof navigator !== 'undefined' && navigator.share && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <Button
              variant="luxe"
              size="md"
              className="w-full"
              onClick={nativeShare}
              leftIcon={<Smartphone size={18} />}
            >
              Partager avec le menu natif
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}