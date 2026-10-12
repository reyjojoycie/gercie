// components/auth/SessionCard.tsx
'use client'

import { motion } from 'framer-motion'
import { Monitor, Smartphone, MapPin, Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface Session {
  id: string
  ip: string
  user_agent: string
  last_active: string
  is_current: boolean
}

interface SessionCardProps {
  session: Session
  onRevoke?: (id: string) => void
  isRevoking?: boolean
}

export function SessionCard({ session, onRevoke, isRevoking = false }: SessionCardProps) {
  const isMobile = /Mobi|Android|iPhone/i.test(session.user_agent)
  const browser = session.user_agent?.includes('Chrome')
    ? 'Chrome'
    : session.user_agent?.includes('Firefox')
    ? 'Firefox'
    : session.user_agent?.includes('Safari')
    ? 'Safari'
    : 'Navigateur'

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center">
          {isMobile ? (
            <Smartphone size={20} className="text-gold-600 dark:text-gold-400" />
          ) : (
            <Monitor size={20} className="text-gold-600 dark:text-gold-400" />
          )}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
              {isMobile ? 'Mobile' : 'Ordinateur'} – {browser}
            </span>
            {session.is_current && (
              <Badge variant="gold" size="sm">
                Actuelle
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {session.ip}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />{' '}
              {new Date(session.last_active).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {!session.is_current && onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(session.id)}
          loading={isRevoking}
          disabled={isRevoking}
          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <X size={14} className="mr-1" /> Révoquer
        </Button>
      )}
    </motion.div>
  )
}

export default SessionCard