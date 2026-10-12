// components/admin/SaisieCodeLivreur.tsx
'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QrCode, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { Html5Qrcode } from 'html5-qrcode'

interface SaisieCodeLivreurProps {
  commandeId: string
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export default function SaisieCodeLivreur({
  commandeId,
  onSuccess,
  onCancel,
  className,
}: SaisieCodeLivreurProps) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tentativesRestantes, setTentativesRestantes] = useState(3)
  const [showScanner, setShowScanner] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().slice(0, 6)
    setCode(value)
    if (error) setError(null)
  }

  const handleSubmit = async () => {
    if (code.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/commandes/${commandeId}/valider-collecte`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_livreur: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Code invalide')
      }
      setSuccess(true)
      toast({ type: 'success', message: 'Collecte validée !' })
      onSuccess?.()
      // Réinitialisation après un court délai
      setTimeout(() => {
        setCode('')
        setSuccess(false)
      }, 1500)
    } catch (err: any) {
      const message = err.message
      setError(message)
      // Mise à jour des tentatives restantes (l'API les retourne éventuellement)
      if (message.includes('tentatives_restantes')) {
        const match = message.match(/\d+/)
        if (match) setTentativesRestantes(Number(match[0]))
      } else {
        setTentativesRestantes(t => Math.max(0, t - 1))
      }
    } finally {
      setLoading(false)
    }
  }

  const startScanner = useCallback(() => {
    setShowScanner(true)
    const scanner = new Html5Qrcode('qr-reader-livreur')
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        setCode(decodedText.slice(0, 6).toUpperCase())
        setShowScanner(false)
        scanner.stop()
      },
      () => {}
    ).catch(() => {
      toast({ type: 'error', message: 'Impossible d’activer la caméra' })
      setShowScanner(false)
    })
  }, [toast])

  return (
    <div className={className}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            placeholder="Code livreur (ex: A1B2C3)"
            value={code}
            onChange={handleChange}
            maxLength={6}
            className="font-mono text-lg tracking-widest"
            disabled={loading || success || tentativesRestantes === 0}
            autoFocus
          />
        </div>
        <Button
          variant="outline-gold"
          size="icon"
          onClick={startScanner}
          disabled={loading}
          title="Scanner le QR code"
        >
          <QrCode size={18} />
        </Button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-500 text-xs mt-1 flex items-center gap-1"
          >
            <XCircle size={14} /> {error}
          </motion.p>
        )}
        {success && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-green-500 text-xs mt-1 flex items-center gap-1"
          >
            <CheckCircle size={14} /> Code valide, transfert confirmé.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle size={12} className={tentativesRestantes <= 1 ? 'text-red-500' : ''} />
          <span>
            {tentativesRestantes > 0
              ? `Tentatives restantes : ${tentativesRestantes}`
              : 'Compte bloqué temporairement'}
          </span>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
              Annuler
            </Button>
          )}
          <Button
            variant="luxe"
            size="sm"
            onClick={handleSubmit}
            loading={loading}
            disabled={code.length !== 6 || loading || success || tentativesRestantes === 0}
          >
            Valider la collecte
          </Button>
        </div>
      </div>

      {/* Scanner modal (simplifié, on peut le placer dans un Modal si souhaité) */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-midnight-900 rounded-xl p-4 max-w-sm w-full">
            <div id="qr-reader-livreur" className="w-full" />
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowScanner(false)}
            >
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}