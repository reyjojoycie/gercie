// app/admin/temoignages/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTestimonialsAdmin } from '@/hooks/useTestimonialsAdmin'
import { TestimonialsTable } from '@/components/admin/testimonials/TestimonialsTable'
import { StatsCards } from '@/components/admin/testimonials/StatsCards'
import { FiltersBar } from '@/components/admin/testimonials/FiltersBar'
import { ConfirmDialog } from '@/components/admin/testimonials/ConfirmDialog'
import { TestimonialForm } from '@/components/admin/testimonials/TestimonialForm'
import { ResponseEditor } from '@/components/admin/testimonials/ResponseEditor'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  RefreshCcw
} from 'lucide-react'

/* ========================================================================== */
/*  Système de notification temporaire (léger, sans dépendance)               */
/* ========================================================================== */
type NotificationType = 'success' | 'error' | 'info'

interface Notification {
  id: number
  type: NotificationType
  message: string
}

function Notifications({ notifications, onRemove }: { notifications: Notification[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className={cn(
              'rounded-xl border p-4 shadow-strong flex items-start gap-2 bg-card',
              notif.type === 'success' && 'border-green-400/40',
              notif.type === 'error' && 'border-red-400/40',
              notif.type === 'info' && 'border-blue-400/40'
            )}
          >
            {notif.type === 'success' ? (
              <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
            ) : notif.type === 'error' ? (
              <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm">{notif.message}</div>
            <button onClick={() => onRemove(notif.id)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ========================================================================== */
/*  Page                                                                       */
/* ========================================================================== */
export default function AdminTestimonialsPage() {
  const {
    testimonials,
    totalItems,
    totalPages,
    stats,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,
    selected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
    changeStatus,
    toggleFeatured,
    reply,
    bulkUpdateStatus,
    bulkDelete,
    exportCSV,
    isMutating
  } = useTestimonialsAdmin({ limit: 10 })

  // État des modales
  const [editItem, setEditItem] = useState<any | null>(null) // null = fermé, {} = création, objet = édition
  const [replyItem, setReplyItem] = useState<any | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  let notifId = 0
  const addNotification = (type: NotificationType, message: string) => {
    const id = Date.now() + notifId++
    setNotifications((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 5000)
  }
  const removeNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  // Réinitialiser la sélection au changement de page (déjà fait dans le hook, mais on peut aussi le faire ici)
  useEffect(() => {
    clearSelection()
  }, [page, filters, sort]) // eslint-disable-line

  // Gestionnaires de mutation avec notifications
  const handleCreateOrUpdate = async (data: any) => {
    try {
      if (data.id) {
        await updateTestimonial(data.id, data)
        addNotification('success', 'Témoignage mis à jour')
      } else {
        await createTestimonial(data)
        addNotification('success', 'Témoignage créé avec succès')
      }
      setEditItem(null)
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors de l’enregistrement')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTestimonial(id)
      addNotification('success', 'Témoignage supprimé')
      setConfirmDelete(null)
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors de la suppression')
    }
  }

  const handleStatusChange = async (id: string, status: 'published' | 'pending' | 'rejected') => {
    try {
      await changeStatus(id, status)
      addNotification('info', `Statut changé en "${status}"`)
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors du changement de statut')
    }
  }

  const handleFeaturedToggle = async (id: string, isFeatured: boolean) => {
    try {
      await toggleFeatured(id, isFeatured)
      addNotification('info', isFeatured ? 'Mis en avant' : 'Retiré de la mise en avant')
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors du changement')
    }
  }

  const handleReply = async (id: string, responseText: string) => {
    try {
      await reply(id, responseText)
      addNotification('success', 'Réponse publiée')
      setReplyItem(null)
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors de la réponse')
    }
  }

  const handleBulkAction = async (action: 'publish' | 'reject' | 'delete') => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    try {
      if (action === 'publish') {
        await bulkUpdateStatus(ids, 'published')
        addNotification('success', `${ids.length} témoignage(s) publié(s)`)
      } else if (action === 'reject') {
        await bulkUpdateStatus(ids, 'rejected')
        addNotification('success', `${ids.length} témoignage(s) rejeté(s)`)
      } else if (action === 'delete') {
        await bulkDelete(ids)
        addNotification('success', `${ids.length} témoignage(s) supprimé(s)`)
      }
      clearSelection()
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors de l’action groupée')
    }
  }

  // Templates de réponse (exemple)
  const responseTemplates = [
    { id: 'thanks', label: 'Remerciement', content: 'Merci {clientName} pour votre retour !' },
    { id: 'improve', label: 'Amélioration', content: 'Nous prenons en compte votre avis pour nous améliorer.' }
  ]

  return (
    <div className="space-y-6">
      <Notifications notifications={notifications} onRemove={removeNotification} />

      <div>
        <h1 className="text-2xl font-bold text-foreground font-serif">Témoignages clients</h1>
        <p className="text-muted-foreground text-sm">
          Gérez les avis, réponses et mises en avant.
        </p>
      </div>

      {/* Statistiques */}
      <StatsCards
        stats={stats}
        isLoading={isLoading}
        onFilterClick={(filter) => {
          if (filter.status) setFilters({ ...filters, status: filter.status })
        }}
      />

      {/* Barre d'outils */}
      <FiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        sortField={sort.field}
        sortOrder={sort.order}
        onSortChange={(field, order) => setSort({ field, order })}
        totalResults={totalItems}
        onAdd={() => setEditItem({})}
        onExport={exportCSV}
        productSuggestions={['iPhone', 'Samsung', 'Wallet Gercie']}
      />

      {/* Barre d'actions groupées (visible si sélection) */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-gold-400/10 border border-gold-400/30 rounded-xl p-3 flex flex-wrap items-center gap-3"
        >
          <span className="text-sm font-medium">{selected.size} sélectionné(s)</span>
          <Button variant="outline-gold" size="sm" onClick={() => handleBulkAction('publish')} disabled={isMutating}>
            Publier
          </Button>
          <Button variant="outline-gold" size="sm" onClick={() => handleBulkAction('reject')} disabled={isMutating}>
            Rejeter
          </Button>
          <Button variant="outline-gold" size="sm" onClick={() => handleBulkAction('delete')} disabled={isMutating} className="text-red-500 border-red-300 hover:bg-red-50">
            Supprimer
          </Button>
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground p-1">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {/* Tableau */}
      {isError ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-muted-foreground mb-4">
            {error?.message || 'Erreur lors du chargement des témoignages.'}
          </p>
          <Button variant="outline-gold" onClick={() => refetch()}>
            <RefreshCcw size={14} className="mr-1" /> Réessayer
          </Button>
        </div>
      ) : (
        <>
          <TestimonialsTable
            testimonials={testimonials}
            isLoading={isLoading}
            sortField={sort.field}
            sortOrder={sort.order}
            onSort={(field) => setSort({ field, order: sort.order === 'asc' ? 'desc' : 'asc' })}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onEdit={(item) => setEditItem(item)}
            onDelete={(id) => setConfirmDelete(id)}
            onStatusChange={handleStatusChange}
            onToggleFeatured={handleFeaturedToggle}
            onReply={(item) => setReplyItem(item)}
            disabledActions={isMutating ? selected : undefined} // désactiver les actions si mutation en cours
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {totalItems} résultat(s) – Page {page}/{totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline-gold"
                  size="icon"
                  disabled={page === 1 || isMutating}
                  onClick={() => setPage(Math.max(1, page - 1))}
                >
                  &lt;
                </Button>
                <Button
                  variant="outline-gold"
                  size="icon"
                  disabled={page === totalPages || isMutating}
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                >
                  &gt;
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modale d'ajout / édition */}
      <AnimatePresence>
        {editItem !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setEditItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-strong w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {editItem.id ? 'Modifier' : 'Ajouter'} un témoignage
                </h2>
                <button onClick={() => setEditItem(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X size={18} />
                </button>
              </div>
              <TestimonialForm
                initialData={editItem}
                onSave={handleCreateOrUpdate}
                onCancel={() => setEditItem(null)}
                isSaving={isMutating}
                productSuggestions={['iPhone', 'Samsung', 'Wallet Gercie']}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale de réponse */}
      <AnimatePresence>
        {replyItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setReplyItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-strong w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Répondre à {replyItem.name}</h2>
                <button onClick={() => setReplyItem(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X size={18} />
                </button>
              </div>
              <ResponseEditor
                initialResponse={replyItem.admin_response || ''}
                testimonialText={replyItem.text}
                clientName={replyItem.name}
                templates={responseTemplates}
                onSave={(responseText) => handleReply(replyItem.id, responseText)}
                onCancel={() => setReplyItem(null)}
                isSaving={isMutating}
                onSaved={() => setReplyItem(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation de suppression */}
      <ConfirmDialog
        open={confirmDelete !== null}
        message="Supprimer ce témoignage ? Cette action est irréversible."
        variant="danger"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        isLoading={isMutating}
        onConfirm={() => handleDelete(confirmDelete!)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}