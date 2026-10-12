// features/admin/hooks/useAdminOrders.ts
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

export interface Article {
  produit_id: string
  nom: string
  quantite: number
  prix_unitaire: number
  image?: string
}

export interface Commande {
  id: string
  numero: string
  total: number
  statut: string
  date: string
  type_livraison: string
  acheteur: {
    nom: string
    prenom: string
    email: string
  }
  articles: Article[]
  adresse_livraison?: string
  code_livraison?: string
}

export interface CommandesResponse {
  data: Commande[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats?: {
    commandesJour: number
    caJour: number
    enAttente: number
    parStatut?: Record<string, number>
  }
}

export interface UseAdminOrdersOptions {
  /** Recherche textuelle (numéro, email, nom) */
  search?: string
  /** Filtre par statut */
  statut?: string
  /** Filtre par type de livraison */
  typeLivraison?: string
  /** Page actuelle (1-indexée) */
  page?: number
  /** Nombre d'éléments par page */
  limit?: number
  /** Colonne de tri */
  sortBy?: 'created_at' | 'total_global' | 'statut' | 'numero_commande'
  /** Ordre de tri */
  sortOrder?: 'asc' | 'desc'
  /** Date de début (YYYY-MM-DD) */
  dateDebut?: string
  /** Date de fin (YYYY-MM-DD) */
  dateFin?: string
  /** Montant minimum */
  minTotal?: number
  /** Montant maximum */
  maxTotal?: number
  /** Désactive la requête */
  enabled?: boolean
  /** Stale time (ms) */
  staleTime?: number
  /** Callback après succès */
  onSuccess?: (data: CommandesResponse) => void
  /** Callback après erreur */
  onError?: (error: Error) => void
}

/* ========================================================================== */
/*  Hook useAdminOrders                                                        */
/* ========================================================================== */

export function useAdminOrders(options: UseAdminOrdersOptions = {}) {
  const {
    search = '',
    statut = '',
    typeLivraison = '',
    page = 1,
    limit = 10,
    sortBy = 'created_at',
    sortOrder = 'desc',
    dateDebut = '',
    dateFin = '',
    minTotal,
    maxTotal,
    enabled = true,
    staleTime = 30_000,
    onSuccess,
    onError,
  } = options

  const queryClient = useQueryClient()

  // État local pour le mode d'export (ne déclenche pas de re-render inutile)
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json')

  // Clé de cache (stable)
  const queryKey = useMemo(
    () => [
      'admin-orders',
      search,
      statut,
      typeLivraison,
      page,
      limit,
      sortBy,
      sortOrder,
      dateDebut,
      dateFin,
      minTotal,
      maxTotal,
      exportFormat,
    ],
    [search, statut, typeLivraison, page, limit, sortBy, sortOrder, dateDebut, dateFin, minTotal, maxTotal, exportFormat]
  )

  // Requête principale
  const query = useQuery<CommandesResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statut) params.append('statut', statut)
      if (typeLivraison) params.append('type_livraison', typeLivraison)
      params.append('page', page.toString())
      params.append('limit', limit.toString())
      params.append('sort_by', sortBy)
      params.append('sort_order', sortOrder)
      if (dateDebut) params.append('date_debut', dateDebut)
      if (dateFin) params.append('date_fin', dateFin)
      if (minTotal !== undefined) params.append('min_total', minTotal.toString())
      if (maxTotal !== undefined) params.append('max_total', maxTotal.toString())
      params.append('format', exportFormat)

      const res = await fetch(`/api/admin/commandes?${params.toString()}`)

      // Si export CSV, on télécharge le fichier
      if (exportFormat === 'csv') {
        if (!res.ok) throw new Error('Erreur export CSV')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        // On remet le format en JSON après l'export
        setExportFormat('json')
        // On renvoie un objet vide pour ne pas casser le flux
        return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
        throw new Error(err.error || 'Erreur lors du chargement des commandes')
      }

      return res.json()
    },
    enabled: enabled && exportFormat === 'json', // On désactive la requête automatique en mode CSV
    staleTime,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    refetchOnWindowFocus: false,
  })

  // Écoute des changements pour callbacks
  const { data, isSuccess, isError, error } = query

  if (isSuccess && data && onSuccess) {
    onSuccess(data)
  }
  if (isError && error && onError) {
    onError(error as Error)
  }

  // Raccourcis vers les données
  const orders = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 1 }
  const stats = data?.stats ?? null

  // ---- Actions ----

  /** Invalider le cache et recharger */
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  }, [queryClient])

  /** Précharger la page suivante */
  const prefetchNextPage = useCallback(() => {
    if (pagination.page < pagination.totalPages) {
      const nextParams = new URLSearchParams()
      if (search) nextParams.append('search', search)
      if (statut) nextParams.append('statut', statut)
      if (typeLivraison) nextParams.append('type_livraison', typeLivraison)
      nextParams.append('page', (page + 1).toString())
      nextParams.append('limit', limit.toString())
      nextParams.append('sort_by', sortBy)
      nextParams.append('sort_order', sortOrder)

      queryClient.prefetchQuery({
        queryKey: ['admin-orders', search, statut, typeLivraison, page + 1, limit, sortBy, sortOrder, dateDebut, dateFin, minTotal, maxTotal, 'json'],
        queryFn: async () => {
          const res = await fetch(`/api/admin/commandes?${nextParams.toString()}&format=json`)
          if (!res.ok) throw new Error('Erreur prefetch')
          return res.json()
        },
        staleTime,
      })
    }
  }, [queryClient, search, statut, typeLivraison, page, limit, sortBy, sortOrder, dateDebut, dateFin, minTotal, maxTotal, staleTime, pagination])

  /** Exporter les commandes filtrées en CSV */
  const exportCSV = useCallback(() => {
    setExportFormat('csv')
    // On force un refetch immédiat
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey })
    }, 50)
  }, [queryClient, queryKey])

  /** Changer le statut d'une commande */
  const updateStatus = useCallback(
    async (commandeId: string, newStatus: string, commentaire?: string) => {
      const res = await fetch('/api/admin/commandes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [commandeId], statut: newStatus, commentaire }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur mise à jour statut')
      }
      invalidate()
      return res.json()
    },
    [invalidate]
  )

  /** Mise à jour groupée de statuts */
  const bulkUpdateStatus = useCallback(
    async (ids: string[], newStatus: string, commentaire?: string) => {
      const res = await fetch('/api/admin/commandes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, statut: newStatus, commentaire }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur mise à jour groupée')
      }
      invalidate()
      return res.json()
    },
    [invalidate]
  )

  return {
    // Données
    data: orders,                 // rétro‑compatibilité
    orders,
    pagination,
    stats,

    // État
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    isFetching: query.isFetching,

    // Actions
    refetch: query.refetch,
    invalidate,
    prefetchNextPage,
    exportCSV,
    updateStatus,
    bulkUpdateStatus,
  }
}