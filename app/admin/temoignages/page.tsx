// app/admin/temoignages/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  RefreshCcw,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

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
  DEFAULT_TESTIMONIAL_SETTINGS,
  type Testimonial,
  type TestimonialSettings,
} from '@/lib/testimonials'

/* ========================================================================== */
/*  Notifications locales                                                      */
/* ========================================================================== */

type NotificationType = 'success' | 'error' | 'info'

interface Notification {
  id: number
  type: NotificationType
  message: string
}

function Notifications({
  notifications,
  onRemove,
}: {
  notifications: Notification[]
  onRemove: (id: number) => void
}) {
  return (
    <div className="fixed right-4 top-20 z-50 max-w-sm space-y-2">
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className={cn(
              'flex items-start gap-2 rounded-xl border bg-card p-4 shadow-strong',
              notif.type === 'success' && 'border-green-400/40',
              notif.type === 'error' && 'border-red-400/40',
              notif.type === 'info' && 'border-blue-400/40'
            )}
          >
            {notif.type === 'success' ? (
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-green-500" />
            ) : notif.type === 'error' ? (
              <XCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
            ) : (
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-blue-500" />
            )}

            <div className="flex-1 text-sm">{notif.message}</div>

            <button
              type="button"
              onClick={() => onRemove(notif.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fermer la notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ========================================================================== */
/*  Settings panel                                                             */
/* ========================================================================== */

function SettingsPanel({
  settings,
  onSave,
  isSaving,
}: {
  settings: TestimonialSettings
  onSave: (settings: Partial<TestimonialSettings>) => Promise<void>
  isSaving: boolean
}) {
  const [form, setForm] = useState(settings)
  const [advancedConfigText, setAdvancedConfigText] = useState('{}')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(settings)
    setAdvancedConfigText(JSON.stringify(settings.advanced_config || {}, null, 2))
  }, [settings])

  const handleSave = async () => {
    setError(null)

    let advancedConfig: Record<string, any> = {}

    try {
      advancedConfig = JSON.parse(advancedConfigText || '{}')
    } catch {
      setError('Le JSON de configuration avancée est invalide.')
      return
    }

    try {
      await onSave({
        ...form,
        advanced_config: advancedConfig,
      })
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la sauvegarde.')
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="text-base font-bold text-foreground">
          Réglages des témoignages
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrôle les soumissions publiques, la modération et l’affichage.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">
            Autoriser les avis anonymes
          </span>
          <input
            type="checkbox"
            checked={form.allow_anonymous_submissions}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                allow_anonymous_submissions: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">
            Exiger une connexion
          </span>
          <input
            type="checkbox"
            checked={form.require_login_to_post}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                require_login_to_post: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">
            Publier automatiquement les utilisateurs connectés
          </span>
          <input
            type="checkbox"
            checked={form.auto_publish_authenticated}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                auto_publish_authenticated: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">
            Afficher le champ produit
          </span>
          <input
            type="checkbox"
            checked={form.show_product_field}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                show_product_field: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
          <span className="text-sm font-medium text-foreground">
            Afficher les likes
          </span>
          <input
            type="checkbox"
            checked={form.show_likes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, show_likes: event.target.checked }))
            }
            className="h-4 w-4 rounded border-border"
          />
        </label>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Maximum mis en avant
          </label>
          <input
            type="number"
            min={0}
            max={50}
            value={form.max_featured}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                max_featured: Number(event.target.value) || 0,
              }))
            }
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">
            Message de modération
          </label>
          <textarea
            value={form.moderation_message}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                moderation_message: event.target.value,
              }))
            }
            rows={2}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">
            Configuration avancée JSON
          </label>
          <textarea
            value={advancedConfigText}
            onChange={(event) => setAdvancedConfigText(event.target.value)}
            rows={6}
            className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="luxe" onClick={handleSave} loading={isSaving}>
          Enregistrer les réglages
        </Button>
      </div>
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
    settings,
    logs,
    productOptions,
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
    saveSettings,
    clearLogs,
    exportCSV,
    isMutating,
  } = useTestimonialsAdmin({ limit: 10 })

  const [activeTab, setActiveTab] = useState<'list' | 'settings' | 'logs'>('list')
  const [editItem, setEditItem] = useState<Partial<Testimonial> | null>(null)
  const [replyItem, setReplyItem] = useState<Testimonial | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClearLogs, setConfirmClearLogs] = useState(false)

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

  const handleCreateOrUpdate = async (data: Partial<Testimonial> & { id?: string }) => {
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

  const handleStatusChange = async (
    id: string,
    status: Testimonial['status']
  ) => {
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
      addNotification(
        'info',
        isFeatured ? 'Mis en avant' : 'Retiré de la mise en avant'
      )
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

  const handleClearLogs = async () => {
    try {
      await clearLogs()
      addNotification('success', 'Journal vidé')
      setConfirmClearLogs(false)
    } catch (err: any) {
      addNotification('error', err.message || 'Erreur lors de la purge du journal')
    }
  }

  const responseTemplates = [
    {
      id: 'thanks',
      label: 'Remerciement',
      content: 'Merci {clientName} pour votre retour !',
    },
    {
      id: 'improve',
      label: 'Amélioration',
      content:
        'Nous prenons en compte votre avis pour nous améliorer. Merci de nous avoir signalé cela.',
    },
    {
      id: 'contact',
      label: 'Contact support',
      content:
        'Nous sommes désolés pour cette expérience. Notre équipe va te contacter rapidement.',
    },
  ]

  return (
    <div className="space-y-6">
      <Notifications notifications={notifications} onRemove={removeNotification} />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground font-serif">
            <MessageSquare size={24} className="text-gold-500" />
            Témoignages clients
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les avis, réponses, mises en avant, modération et journal d’audit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline-gold"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
            leftIcon={<RefreshCcw size={14} />}
          >
            Rafraîchir
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
        {[
          { key: 'list', label: 'Avis', icon: <MessageSquare size={16} /> },
          { key: 'settings', label: 'Réglages', icon: <SlidersHorizontal size={16} /> },
          { key: 'logs', label: 'Journal', icon: <Settings size={16} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.key

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold-500',
                isActive
                  ? 'bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'list' && (
        <>
          <StatsCards
            stats={stats}
            isLoading={isLoading}
            onFilterClick={(filter) => {
              if (filter.status) setFilters({ ...filters, status: filter.status as any })
              if (filter.featured) setFilters({ ...filters, featured: filter.featured as any })
              if (filter.verified) setFilters({ ...filters, verified: filter.verified as any })
            }}
          />

          <FiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            sortField={sort.field}
            sortOrder={sort.order}
            onSortChange={(field, order) => setSort({ field, order })}
            totalResults={totalItems}
            onAdd={() => setEditItem({})}
            onExport={exportCSV}
            productSuggestions={productOptions}
          />

          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-400/30 bg-gold-400/10 p-3"
            >
              <span className="text-sm font-medium">
                {selected.size} sélectionné(s)
              </span>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulkAction('publish')}
                disabled={isMutating}
              >
                Publier
              </Button>

              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => handleBulkAction('reject')}
                disabled={isMutating}
              >
                Rejeter
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() => handleBulkAction('delete')}
                disabled={isMutating}
                leftIcon={<Trash2 size={14} />}
              >
                Supprimer
              </Button>

              <button
                type="button"
                onClick={clearSelection}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label="Annuler la sélection"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}

          {isError ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />

              <p className="mb-4 text-muted-foreground">
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
                onSort={(field) =>
                  setSort({
                    field: field as any,
                    order: sort.field === field && sort.order === 'asc' ? 'desc' : 'asc',
                  })
                }
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onEdit={(item) => setEditItem(item)}
                onDelete={(id) => setConfirmDelete(id)}
                onStatusChange={handleStatusChange}
                onToggleFeatured={handleFeaturedToggle}
                onReply={(item) => setReplyItem(item)}
                disabledActions={isMutating ? selected : undefined}
              />

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
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
        </>
      )}

      {activeTab === 'settings' && (
        <SettingsPanel
          settings={settings || DEFAULT_TESTIMONIAL_SETTINGS}
          onSave={saveSettings}
          isSaving={isMutating}
        />
      )}

      {activeTab === 'logs' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Journal d’audit
              </h3>
              <p className="text-sm text-muted-foreground">
                Trace des actions admin sur les témoignages.
              </p>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmClearLogs(true)}
              leftIcon={<Trash2 size={14} />}
            >
              Vider
            </Button>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucune entrée d’audit.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-border bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral" size="sm">
                        {log.action}
                      </Badge>

                      {log.entity_id && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {log.entity_id.slice(0, 8)}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>

                  {(log.before || log.after) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Voir détails
                      </summary>

                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                        {JSON.stringify(
                          { before: log.before, after: log.after },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modale ajout / édition */}
      <AnimatePresence>
        {editItem !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setEditItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-strong"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {editItem.id ? 'Modifier' : 'Ajouter'} un témoignage
                </h2>

                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="rounded-lg p-1.5 hover:bg-muted"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <TestimonialForm
                initialData={editItem}
                onSave={handleCreateOrUpdate}
                onCancel={() => setEditItem(null)}
                isSaving={isMutating}
                productSuggestions={productOptions}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale réponse */}
      <AnimatePresence>
        {replyItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setReplyItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-strong"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  Répondre à {replyItem.name}
                </h2>

                <button
                  type="button"
                  onClick={() => setReplyItem(null)}
                  className="rounded-lg p-1.5 hover:bg-muted"
                  aria-label="Fermer"
                >
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

      <ConfirmDialog
        open={confirmClearLogs}
        title="Vider le journal"
        message="Toutes les entrées du journal d’audit seront supprimées."
        variant="warning"
        confirmLabel="Vider"
        cancelLabel="Annuler"
        isLoading={isMutating}
        onConfirm={handleClearLogs}
        onCancel={() => setConfirmClearLogs(false)}
      />
    </div>
  )
}