// app/admin/codes/page.tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/components/ui/Toast'
import {
  Plus, Trash2, Copy, Check, Search, X, Key,
  Clock, Sparkles, Percent, RefreshCw, Power, PowerOff,
  Calendar, Hash, ArrowUpDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
interface CodePromo {
  id: string
  code: string
  reduction_percent: number
  max_utilisations: number
  utilisations_actuelles: number
  actif: boolean
  created_at: string
  expires_at: string | null
}

interface CodesResponse {
  data: CodePromo[]
  pagination: {
    page: number
    totalPages: number
    total: number
  }
}

/* ========================================================================== */
/*  Schéma de génération                                                       */
/* ========================================================================== */
const generateSchema = z.object({
  count: z.coerce.number().int().min(1, 'Minimum 1').max(100, 'Maximum 100'),
  reductionPercent: z.coerce.number().int().min(1, '1% minimum').max(99, '99% maximum'),
  maxUtilisations: z.coerce.number().int().min(1, 'Au moins 1').max(1000, 'Maximum 1000'),
  expiresAt: z.string().optional(),
})

type GenerateForm = z.infer<typeof generateSchema>

/* ========================================================================== */
/*  Constantes                                                                 */
/* ========================================================================== */
const PER_PAGE = 10

/* ========================================================================== */
/*  Page                                                                       */
/* ========================================================================== */
export default function CodesPromoPage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  // Filtres
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'epuise'>('all')
  const [page, setPage] = useState(1)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'created_at' | 'code' | 'reduction_percent'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Formulaire de génération
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      count: 5,
      reductionPercent: 10,
      maxUtilisations: 1,
      expiresAt: '',
    },
  })

  // Requête React Query
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CodesResponse>({
    queryKey: ['admin-codes-promo', search, filterStatut, page, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterStatut !== 'all') params.set('statut', filterStatut)
      params.set('page', String(page))
      params.set('limit', String(PER_PAGE))
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)

      const res = await fetch(`/api/admin/codes?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur chargement')
      }
      return res.json()
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  })

  const codes = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, totalPages: 1, total: 0 }

  // Mutation génération
  const generateMutation = useMutation({
    mutationFn: async (values: GenerateForm) => {
      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: values.count,
          reduction_percent: values.reductionPercent,
          max_utilisations: values.maxUtilisations,
          expires_at: values.expiresAt || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur génération')
      return res.json()
    },
    onSuccess: (data) => {
      toast.addToast({ type: 'success', message: `${data.count} code(s) promo généré(s) !` })
      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      setGenerateModalOpen(false)
      reset()
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation suppression
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/codes?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur suppression')
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Code supprimé' })
      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
      setDeleteTargetId(null)
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  // Mutation bascule actif/inactif
  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const res = await fetch('/api/admin/codes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, actif: !actif }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-codes-promo'] })
    },
  })

  // Handlers
  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.addToast({ type: 'info', message: 'Code copié !' })
  }

  const handleSortToggle = (col: 'created_at' | 'code' | 'reduction_percent') => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterStatut('all')
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* En-tête */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gold-100 dark:bg-gold-900/30 text-gold-600 dark:text-gold-400">
                  <Percent size={24} />
                </div>
                Codes promo
              </h1>
              <p className="text-muted-foreground mt-1">
                Générez et gérez vos codes de réduction.
              </p>
            </div>
            <Button
              variant="luxe"
              size="md"
              onClick={() => setGenerateModalOpen(true)}
              leftIcon={<Plus size={16} />}
            >
              Générer des codes
            </Button>
          </div>

          {/* Filtres et stats */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher un code..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setPage(1) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold-500"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {['all', 'actif', 'epuise'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatut(s as any); setPage(1) }}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition border whitespace-nowrap',
                    filterStatut === s
                      ? 'bg-gold-400/20 border-gold-400/50 text-gold-600 shadow-gold'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {s === 'all' ? 'Tous' : s === 'actif' ? 'Actifs' : 'Épuisés'}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {(search || filterStatut !== 'all') && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500">
                  <X size={14} className="mr-1" /> Effacer
                </Button>
              )}
              <div className="text-xs text-muted-foreground font-medium">
                {pagination.total} code(s)
              </div>
            </div>
          </div>

          {/* Tableau */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="xl" />
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{(error as Error)?.message || 'Erreur de chargement'}</p>
              <Button variant="outline-gold" onClick={() => refetch()}>
                <RefreshCw size={14} className="mr-1" /> Réessayer
              </Button>
            </div>
          ) : (
            <>
              <Card variant="glass" className="border-gold-400/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button onClick={() => handleSortToggle('code')} className="flex items-center gap-1 hover:text-gold-500">
                            Code <ArrowUpDown size={12} />
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button onClick={() => handleSortToggle('reduction_percent')} className="flex items-center gap-1 hover:text-gold-500">
                            Réduction <ArrowUpDown size={12} />
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Utilisations</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <button onClick={() => handleSortToggle('created_at')} className="flex items-center gap-1 hover:text-gold-500">
                            Créé le <ArrowUpDown size={12} />
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <AnimatePresence>
                        {codes.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-muted-foreground">
                              Aucun code promo trouvé.
                            </td>
                          </tr>
                        ) : (
                          codes.map((promo) => (
                            <motion.tr
                              key={promo.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="hover:bg-gold-400/5 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <code className="bg-muted px-3 py-1.5 rounded-lg font-mono text-sm tracking-widest text-gold-600">
                                  {promo.code}
                                </code>
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold">{promo.reduction_percent}%</td>
                              <td className="px-4 py-3 text-sm">
                                {promo.utilisations_actuelles} / {promo.max_utilisations}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {promo.expires_at ? (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Calendar size={14} />
                                    {new Date(promo.expires_at).toLocaleDateString('fr-FR')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {promo.actif ? (
                                  promo.utilisations_actuelles >= promo.max_utilisations ? (
                                    <Badge variant="danger" size="sm">Épuisé</Badge>
                                  ) : (
                                    <Badge variant="accent" size="sm">Actif</Badge>
                                  )
                                ) : (
                                  <Badge variant="neutral" size="sm">Inactif</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                <Clock size={14} className="inline mr-1" />
                                {new Date(promo.created_at).toLocaleDateString('fr-FR')}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleCopy(promo.code, promo.id)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-gold-500 hover:bg-gold-400/10 transition"
                                    title="Copier le code"
                                  >
                                    {copiedId === promo.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                  </button>
                                  <button
                                    onClick={() => toggleMutation.mutate({ id: promo.id, actif: promo.actif })}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-gold-500 hover:bg-gold-400/10 transition"
                                    title={promo.actif ? 'Désactiver' : 'Activer'}
                                  >
                                    {promo.actif ? <PowerOff size={16} /> : <Power size={16} />}
                                  </button>
                                  {promo.utilisations_actuelles === 0 && (
                                    <button
                                      onClick={() => setDeleteTargetId(promo.id)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition"
                                      title="Supprimer"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} sur {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline-gold"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </Container>

      {/* Modal Génération */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title="Générer des codes promo"
        description="Paramétrez les nouveaux codes de réduction."
        size="md"
        accent="gold"
      >
        <form onSubmit={handleSubmit((data) => generateMutation.mutate(data))} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre de codes"
              type="number"
              variant="glass"
              {...register('count')}
              error={errors.count?.message}
              leftIcon={<Hash size={16} className="text-muted-foreground" />}
            />
            <Input
              label="Réduction (%)"
              type="number"
              variant="glass"
              {...register('reductionPercent')}
              error={errors.reductionPercent?.message}
              leftIcon={<Percent size={16} className="text-muted-foreground" />}
            />
            <Input
              label="Utilisations max par code"
              type="number"
              variant="glass"
              {...register('maxUtilisations')}
              error={errors.maxUtilisations?.message}
              leftIcon={<RefreshCw size={16} className="text-muted-foreground" />}
            />
            <Input
              label="Date d'expiration (optionnelle)"
              type="date"
              variant="glass"
              {...register('expiresAt')}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={generateMutation.isPending}
            >
              Générer
            </Button>
            <Button
              type="button"
              variant="outline-gold"
              fullWidth
              onClick={() => setGenerateModalOpen(false)}
              disabled={generateMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmation suppression */}
      <Modal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="Supprimer le code ?"
        description="Cette action est irréversible."
        size="sm"
        accent="danger"
      >
        <div className="flex gap-3">
          <Button
            variant="danger"
            fullWidth
            loading={deleteMutation.isPending}
            onClick={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
          >
            Supprimer
          </Button>
          <Button
            variant="outline"
            fullWidth
            onClick={() => setDeleteTargetId(null)}
            disabled={deleteMutation.isPending}
          >
            Annuler
          </Button>
        </div>
      </Modal>
    </div>
  )
}