// lib/services/testimonialService.ts

/* ========================================================================== */
/*  Types (exportés pour usage dans les hooks / composants)                    */
/* ========================================================================== */

export interface TestimonialAdmin {
  id: string
  name: string
  role?: string
  avatar?: string | null
  text: string
  rating: number
  date: string
  produit?: string | null
  verified: boolean
  likes: number
  status: 'published' | 'pending' | 'rejected'
  admin_response?: string | null
  is_featured: boolean
  user_id?: string | null
  created_at: string
  updated_at: string
}

export interface TestimonialFilters {
  status?: string
  ratingMin?: number
  search?: string
  produit?: string
  dateFrom?: string
  dateTo?: string
  isFeatured?: boolean | null
}

export interface TestimonialSort {
  field: 'name' | 'rating' | 'date' | 'status' | 'likes' | 'created_at' | 'updated_at'
  order: 'asc' | 'desc'
}

export interface TestimonialPagination {
  page: number
  limit: number
}

export interface TestimonialsResponse {
  success: boolean
  data: TestimonialAdmin[]
  meta?: {
    total: number
    page: number
    limit: number
    totalPages: number
    stats?: {
      published: number
      pending: number
      rejected: number
      avgRating: string
    }
  }
}

export interface SingleTestimonialResponse {
  success: boolean
  data: TestimonialAdmin
}

export interface CreateTestimonialPayload {
  name: string
  role?: string
  text: string
  rating: number
  produit?: string
  verified?: boolean
  status?: 'published' | 'pending' | 'rejected'
  is_featured?: boolean
  avatar?: string | null
}

export interface UpdateTestimonialPayload {
  name?: string
  role?: string | null
  text?: string
  rating?: number
  produit?: string | null
  verified?: boolean
  status?: 'published' | 'pending' | 'rejected'
  is_featured?: boolean
  admin_response?: string | null
  avatar?: string | null
}

/* ========================================================================== */
/*  Erreur personnalisée                                                       */
/* ========================================================================== */

export class ApiError extends Error {
  public status: number
  public details?: any

  constructor(message: string, status: number, details?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/* ========================================================================== */
/*  Configuration                                                              */
/* ========================================================================== */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''
const ADMIN_PREFIX = '/api/admin/testimonials'

function adminUrl(path: string = '') {
  return `${API_BASE_URL}${ADMIN_PREFIX}${path}`
}

/* ========================================================================== */
/*  Helpers internes                                                           */
/* ========================================================================== */

/**
 * Sérialise un objet en query string, en ignorant les clés undefined/null.
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    searchParams.set(key, String(value))
  })
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Wrapper fetch avec gestion d'erreur automatique.
 */
async function fetchJson<T>(
  url: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  const controller = new AbortController()
  const timeout = options?.timeout ?? 15000 // 15 secondes par défaut

  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      ...options,
      signal: options?.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })

    if (!res.ok) {
      let errorBody: any
      try {
        errorBody = await res.json()
      } catch {
        errorBody = { error: res.statusText }
      }
      throw new ApiError(
        errorBody?.error || `Erreur ${res.status}`,
        res.status,
        errorBody?.details
      )
    }

    return (await res.json()) as T
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ApiError('Requête annulée (timeout)', 408)
    }
    if (error instanceof ApiError) throw error
    throw new ApiError(error.message || 'Erreur réseau', 0)
  } finally {
    clearTimeout(timeoutId)
  }
}

/* ========================================================================== */
/*  Service                                                                    */
/* ========================================================================== */

export const testimonialService = {
  /**
   * Récupère la liste paginée et filtrée des témoignages (admin).
   */
  list: async (
    filters: TestimonialFilters = {},
    sort: TestimonialSort = { field: 'date', order: 'desc' },
    pagination: TestimonialPagination = { page: 1, limit: 20 },
    signal?: AbortSignal
  ): Promise<TestimonialsResponse> => {
    const params: Record<string, any> = {
      ...filters,
      sort: sort.field,
      order: sort.order,
      page: pagination.page,
      limit: pagination.limit
    }
    return fetchJson<TestimonialsResponse>(adminUrl() + buildQueryString(params), { signal })
  },

  /**
   * Récupère un témoignage par son ID.
   */
  getById: async (id: string, signal?: AbortSignal): Promise<SingleTestimonialResponse> => {
    return fetchJson<SingleTestimonialResponse>(adminUrl(`/${id}`), { signal })
  },

  /**
   * Crée un nouveau témoignage.
   */
  create: async (payload: CreateTestimonialPayload): Promise<SingleTestimonialResponse> => {
    return fetchJson<SingleTestimonialResponse>(adminUrl(), {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * Met à jour un témoignage existant (PATCH partiel).
   */
  update: async (
    id: string,
    payload: UpdateTestimonialPayload
  ): Promise<SingleTestimonialResponse> => {
    return fetchJson<SingleTestimonialResponse>(adminUrl(`/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  },

  /**
   * Supprime définitivement un témoignage.
   */
  delete: async (id: string): Promise<{ success: boolean; data: { id: string } }> => {
    return fetchJson(adminUrl(`/${id}`), { method: 'DELETE' })
  },

  /**
   * Change uniquement le statut d’un témoignage.
   */
  changeStatus: async (
    id: string,
    status: 'published' | 'pending' | 'rejected'
  ): Promise<SingleTestimonialResponse> => {
    return testimonialService.update(id, { status })
  },

  /**
   * Bascule le flag "mis en avant".
   */
  toggleFeatured: async (
    id: string,
    isFeatured: boolean
  ): Promise<SingleTestimonialResponse> => {
    return testimonialService.update(id, { is_featured: isFeatured })
  },

  /**
   * Enregistre ou met à jour la réponse admin à un témoignage.
   */
  reply: async (
    id: string,
    responseText: string
  ): Promise<SingleTestimonialResponse> => {
    return testimonialService.update(id, { admin_response: responseText })
  },

  /**
   * Supprime la réponse admin (passe à null).
   */
  removeReply: async (id: string): Promise<SingleTestimonialResponse> => {
    return testimonialService.update(id, { admin_response: null })
  },

  /**
   * Actions groupées (bulk).
   */
  bulkUpdateStatus: async (
    ids: string[],
    status: 'published' | 'pending' | 'rejected'
  ): Promise<PromiseSettledResult<SingleTestimonialResponse>[]> => {
    const promises = ids.map(id => testimonialService.changeStatus(id, status))
    return Promise.allSettled(promises)
  },

  bulkDelete: async (
    ids: string[]
  ): Promise<PromiseSettledResult<{ success: boolean; data: { id: string } }>[]> => {
    const promises = ids.map(id => testimonialService.delete(id))
    return Promise.allSettled(promises)
  },

  /**
   * Récupère les statistiques globales (depuis la route GET sans pagination).
   * On peut soit utiliser un endpoint dédié `/stats`, soit extraire de la liste.
   */
  getStats: async (): Promise<{
    published: number
    pending: number
    rejected: number
    avgRating: string
  }> => {
    // On récupère juste la première page avec un limit très bas pour avoir les meta
    const result = await testimonialService.list({}, { field: 'date', order: 'desc' }, { page: 1, limit: 1 })
    return result.meta?.stats ?? { published: 0, pending: 0, rejected: 0, avgRating: '0.0' }
  },

  /**
   * Export CSV : récupère toutes les données (limite haute) et déclenche le téléchargement.
   */
  exportCSV: async (filters: TestimonialFilters = {}): Promise<void> => {
    // Récupérer jusqu'à 2000 entrées (ou plus selon besoin)
    const result = await testimonialService.list(
      filters,
      { field: 'date', order: 'desc' },
      { page: 1, limit: 2000 }
    )

    const rows = result.data.map(t => ({
      Nom: t.name,
      Rôle: t.role ?? '',
      Témoignage: t.text,
      Note: t.rating,
      Produit: t.produit ?? '',
      Statut: t.status,
      Date: t.date ? new Date(t.date).toLocaleDateString('fr-FR') : '',
      Vérifié: t.verified ? 'Oui' : 'Non',
      'Mis en avant': t.is_featured ? 'Oui' : 'Non',
      'Réponse admin': t.admin_response ?? ''
    }))

    const headers = Object.keys(rows[0] || {})
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `temoignages_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
}

export default testimonialService