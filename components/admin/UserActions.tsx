// components/admin/UserActions.tsx
'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import {
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Shield,
  ShieldOff,
  Key,
  Wallet,
  Package,
  Ban,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  UserCog,
  Activity,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface UserActionProps {
  /** ID de l'utilisateur */
  userId: string
  /** Email de l'utilisateur */
  email: string
  /** Nom complet */
  fullName: string
  /** Rôle actuel */
  role: 'acheteur' | 'vendeur' | 'admin'
  /** Est‑il admin ? */
  isAdmin: boolean
  /** Est‑il actif ? */
  isActive?: boolean
  /** Callback lors du changement de rôle */
  onChangeRole?: (userId: string, newRole: string) => Promise<void> | void
  /** Callback pour toggle admin */
  onToggleAdmin?: (userId: string, isAdmin: boolean) => Promise<void> | void
  /** Callback pour suspendre / réactiver */
  onToggleActive?: (userId: string, isActive: boolean) => Promise<void> | void
  /** Callback pour supprimer l'utilisateur */
  onDeleteUser?: (userId: string) => Promise<void> | void
  /** Callback pour envoyer un code d'activation */
  onSendActivationCode?: (userId: string) => Promise<void> | void
  /** Callback pour voir le portefeuille */
  onViewWallet?: (userId: string) => void
  /** Callback pour voir les commandes */
  onViewOrders?: (userId: string) => void
  /** Callback pour copier l'ID */
  onCopyId?: (id: string) => void
  /** Afficher le bouton "Voir détails" */
  showViewDetails?: boolean
  /** Lien vers la page de détails (si non fourni, /admin/utilisateurs/:id) */
  detailUrl?: string
  /** Variante d'affichage : dropdown ou boutons individuels */
  variant?: 'dropdown' | 'buttons'
  /** Alignement du dropdown */
  align?: 'left' | 'right'
  /** Désactiver les actions */
  disabled?: boolean
  /** Classes additionnelles */
  className?: string
  /** Masquer des actions spécifiques */
  hideActions?: ('edit' | 'delete' | 'toggleAdmin' | 'toggleActive' | 'sendCode' | 'viewWallet' | 'viewOrders')[]
}

/* ========================================================================== */
/*  Composant UserActions                                                      */
/* ========================================================================== */

export function UserActions({
  userId,
  email,
  fullName,
  role,
  isAdmin,
  isActive = true,
  onChangeRole,
  onToggleAdmin,
  onToggleActive,
  onDeleteUser,
  onSendActivationCode,
  onViewWallet,
  onViewOrders,
  onCopyId,
  showViewDetails = true,
  detailUrl,
  variant = 'dropdown',
  align = 'right',
  disabled = false,
  className,
  hideActions = [],
}: UserActionProps) {
  const router = useRouter()
  const toast = useToast()

  // État du dropdown
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // États des modales de confirmation
  const [confirmAction, setConfirmAction] = useState<{
    action: string
    title: string
    message: string
    icon: React.ReactNode
    onConfirm: () => Promise<void> | void
  } | null>(null)

  // États de chargement par action
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Exécuter une action avec gestion du chargement et des erreurs
  const executeAction = useCallback(
    async (actionName: string, fn: () => Promise<void> | void) => {
      setLoadingAction(actionName)
      try {
        await fn()
        toast.addToast({
          type: 'success',
          message: `${actionName} effectué avec succès`,
        })
      } catch (err: any) {
        toast.addToast({
          type: 'error',
          message: err.message || `Erreur lors de ${actionName}`,
        })
      } finally {
        setLoadingAction(null)
        setOpen(false)
      }
    },
    [toast]
  )

  // Gestion des actions avec confirmation
  const handleAction = (
    actionName: string,
    actionFn: () => Promise<void> | void,
    confirm?: { title: string; message: string; icon: React.ReactNode }
  ) => {
    if (confirm) {
      setConfirmAction({
        action: actionName,
        title: confirm.title,
        message: confirm.message,
        icon: confirm.icon,
        onConfirm: () => executeAction(actionName, actionFn),
      })
      setOpen(false)
      return
    }
    executeAction(actionName, actionFn)
  }

  // Actions disponibles
  const actions = [
    {
      key: 'viewDetails',
      label: 'Voir détails',
      icon: <Eye size={16} />,
      visible: showViewDetails && !hideActions.includes('viewDetails' as any),
      onClick: () => {
        router.push(detailUrl || `/admin/utilisateurs/${userId}`)
        setOpen(false)
      },
    },
    {
      key: 'viewWallet',
      label: 'Portefeuille',
      icon: <Wallet size={16} />,
      visible: !!onViewWallet && !hideActions.includes('viewWallet'),
      onClick: () => {
        onViewWallet!(userId)
        setOpen(false)
      },
    },
    {
      key: 'viewOrders',
      label: 'Commandes',
      icon: <Package size={16} />,
      visible: !!onViewOrders && !hideActions.includes('viewOrders'),
      onClick: () => {
        onViewOrders!(userId)
        setOpen(false)
      },
    },
    {
      key: 'sendCode',
      label: 'Envoyer code d\'activation',
      icon: <Key size={16} />,
      visible: !!onSendActivationCode && !hideActions.includes('sendCode'),
      onClick: () => handleAction('Envoi du code', () => onSendActivationCode!(userId)),
    },
    {
      key: 'toggleAdmin',
      label: isAdmin ? 'Retirer admin' : 'Nommer admin',
      icon: isAdmin ? <ShieldOff size={16} /> : <Shield size={16} />,
      visible: !!onToggleAdmin && !hideActions.includes('toggleAdmin'),
      onClick: () =>
        handleAction(
          isAdmin ? 'Rétrogradation admin' : 'Promotion admin',
          () => onToggleAdmin!(userId, !isAdmin),
          {
            title: isAdmin ? 'Retirer les droits admin ?' : 'Nommer administrateur ?',
            message: isAdmin
              ? `${fullName} ne pourra plus accéder au panneau d'administration.`
              : `${fullName} aura accès à toutes les fonctionnalités d'administration.`,
            icon: isAdmin ? (
              <AlertTriangle size={24} className="text-amber-500" />
            ) : (
              <Shield size={24} className="text-gold-500" />
            ),
          }
        ),
    },
    {
      key: 'toggleActive',
      label: isActive ? 'Suspendre' : 'Réactiver',
      icon: isActive ? <Ban size={16} /> : <RotateCcw size={16} />,
      visible: !!onToggleActive && !hideActions.includes('toggleActive'),
      onClick: () =>
        handleAction(
          isActive ? 'Suspension' : 'Réactivation',
          () => onToggleActive!(userId, !isActive),
          {
            title: isActive ? 'Suspendre cet utilisateur ?' : 'Réactiver cet utilisateur ?',
            message: isActive
              ? `${fullName} ne pourra plus se connecter ni effectuer d'actions.`
              : `${fullName} retrouvera l'accès à son compte.`,
            icon: isActive ? (
              <Ban size={24} className="text-red-500" />
            ) : (
              <RotateCcw size={24} className="text-green-500" />
            ),
          }
        ),
    },
    {
      key: 'edit',
      label: 'Modifier le rôle',
      icon: <UserCog size={16} />,
      visible: !!onChangeRole && !hideActions.includes('edit'),
      onClick: () => {
        // Ouvrir une modale de sélection de rôle
        const newRole = role === 'acheteur' ? 'vendeur' : 'acheteur'
        handleAction(
          'Changement de rôle',
          () => onChangeRole!(userId, newRole),
          {
            title: 'Changer le rôle ?',
            message: `${fullName} passera de « ${role} » à « ${newRole} ».`,
            icon: <UserCog size={24} className="text-gold-500" />,
          }
        )
      },
    },
    {
      key: 'delete',
      label: 'Supprimer',
      icon: <Trash2 size={16} className="text-red-500" />,
      visible: !!onDeleteUser && !hideActions.includes('delete'),
      onClick: () =>
        handleAction(
          'Suppression',
          () => onDeleteUser!(userId),
          {
            title: 'Supprimer définitivement ?',
            message: `${fullName} sera définitivement supprimé de la plateforme. Cette action est irréversible.`,
            icon: <Trash2 size={24} className="text-red-500" />,
          }
        ),
    },
    {
      key: 'copyId',
      label: 'Copier l\'ID',
      icon: <Copy size={16} />,
      visible: !!onCopyId,
      onClick: () => {
        onCopyId!(userId)
        setOpen(false)
      },
    },
  ].filter(a => a.visible)

  const isLoading = loadingAction !== null

  // Rendu selon la variante
  if (variant === 'buttons') {
    return (
      <div className={cn('flex items-center gap-1 flex-wrap', className)}>
        {actions.map(action => (
          <Tooltip key={action.key} content={action.label}>
            <Button
              variant="ghost"
              size="icon"
              onClick={action.onClick}
              disabled={disabled || isLoading}
            >
              {action.icon}
            </Button>
          </Tooltip>
        ))}
      </div>
    )
  }

  // Variante dropdown (par défaut)
  return (
    <div className={cn('relative inline-block', className)} ref={dropdownRef}>
      <Tooltip content="Actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
          disabled={disabled || isLoading}
          className="text-muted-foreground hover:text-gold-500"
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <MoreVertical size={18} />
          )}
        </Button>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 mt-2 min-w-[200px] rounded-xl bg-card border border-border shadow-strong py-1 overflow-hidden',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {/* En-tête utilisateur */}
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>

            {/* Actions */}
            <div className="py-1">
              {actions.map(action => (
                <button
                  key={action.key}
                  onClick={action.onClick}
                  disabled={disabled || isLoading}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-gold-400/5 transition-colors disabled:opacity-50"
                >
                  <span className="flex-shrink-0">{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale de confirmation */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.title || 'Confirmer'}
        size="sm"
        accent="gold"
        closeOnOverlayClick={!isLoading}
      >
        {confirmAction && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              {confirmAction.icon}
            </div>
            <p className="text-sm text-foreground">{confirmAction.message}</p>
            <div className="flex gap-3">
              <Button
                variant="luxe"
                fullWidth
                onClick={async () => {
                  await confirmAction.onConfirm()
                  setConfirmAction(null)
                }}
                loading={isLoading}
              >
                Confirmer
              </Button>
              <Button
                variant="outline-gold"
                fullWidth
                onClick={() => setConfirmAction(null)}
                disabled={isLoading}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}