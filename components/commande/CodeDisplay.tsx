// components/commande/CodeDisplay.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Copy, CheckCircle, QrCode, Key, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Card, CardContent } from '@/components/ui/Card'
import { generateQRCodeDataURL } from '@/lib/qrcode' // si disponible, sinon commenter
import { cn } from '@/lib/utils'

export type CodeType = 'CLIENT' | 'LIVREUR'

interface CodeDisplayProps {
  code: string
  type: CodeType
  label?: string
  context?: 'client' | 'admin' | 'livreur'
  alwaysShow?: boolean          // force l'affichage permanent (admin)
  className?: string
  onCopy?: (code: string) => void
}

export default function CodeDisplay({
  code,
  type,
  label,
  context = 'client',
  alwaysShow = false,
  className,
  onCopy,
}: CodeDisplayProps) {
  const [revealed, setRevealed] = useState(alwaysShow)
  const [copied, setCopied] = useState(false)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  // Révélation temporaire pour les clients
  useEffect(() => {
    if (context === 'client' && revealed && !alwaysShow) {
      const timer = setTimeout(() => setRevealed(false), 15_000)
      return () => clearTimeout(timer)
    }
  }, [revealed, context, alwaysShow])

  // Génération du QR code
  const loadQr = useCallback(async () => {
    if (!code) return
    try {
      // Utilise lib/qrcode si importée, sinon fallback
      const dataUrl = await generateQRCodeDataURL(code).catch(() => null)
      if (dataUrl) {
        setQrSrc(dataUrl)
      } else {
        // fallback externe
        setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`)
      }
    } catch {
      setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`)
    }
  }, [code])

  useEffect(() => {
    if (showQr) loadQr()
  }, [showQr, loadQr])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    onCopy?.(code)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleReveal = () => {
    if (context === 'client' && !alwaysShow) setRevealed(!revealed)
    // pour admin/livreur, revealed est toujours true
  }

  const icon = type === 'CLIENT' ? <Key size={18} className="text-gold-500" /> : <Truck size={18} className="text-blue-500" />
  const displayLabel = label || (type === 'CLIENT' ? 'Code client' : 'Code livreur')

  return (
    <Card className={cn('border-l-4', type === 'CLIENT' ? 'border-l-gold-400' : 'border-l-blue-400', 'bg-card/60 backdrop-blur-sm', className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn('p-2.5 rounded-xl', type === 'CLIENT' ? 'bg-gold-500/10' : 'bg-blue-500/10')}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{displayLabel}</p>
              <AnimatePresence mode="wait">
                {revealed ? (
                  <motion.p
                    key="visible"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xl font-mono font-bold tracking-widest text-foreground mt-0.5 truncate"
                  >
                    {code}
                  </motion.p>
                ) : (
                  <motion.p
                    key="hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xl font-mono tracking-widest text-muted-foreground mt-0.5"
                  >
                    ••••••
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Bouton afficher/masquer (sauf admin) */}
            {context !== 'admin' && !alwaysShow && (
              <Tooltip content={revealed ? 'Masquer' : 'Afficher'}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={toggleReveal}
                >
                  {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </Tooltip>
            )}

            {/* Copier (visible seulement si révélé) */}
            {revealed && (
              <Tooltip content={copied ? 'Copié !' : 'Copier'}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleCopy}
                >
                  {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                </Button>
              </Tooltip>
            )}

            {/* QR code */}
            {revealed && (
              <Tooltip content="Afficher le QR code">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowQr(!showQr)}
                >
                  <QrCode size={16} />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Affichage du QR code */}
        <AnimatePresence>
          {showQr && revealed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="flex justify-center p-2 bg-white rounded-lg">
                {qrSrc ? (
                  <img src={qrSrc} alt="QR Code" className="w-32 h-32" />
                ) : (
                  <div className="w-32 h-32 bg-neutral-100 animate-pulse rounded" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}