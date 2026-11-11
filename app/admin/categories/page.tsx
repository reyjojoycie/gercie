//app/admin/categories/page.tsx
'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'

// UI Components
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import PhotoUpload from '@/components/PhotoUpload'
import { IconPicker } from '@/components/admin/IconPicker'

// Icons
import {
  Layers,
  Plus,
  Search,
  Eye,
  EyeOff,
  Home,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Save,
  Loader2,
  ChevronRight,
  ChevronDown,
  Filter,
  Download,
  Copy,
  Check,
  Square,
  CheckSquare,
  RotateCcw,
  AlertCircle,
  GripVertical,
  FolderTree,
  Sparkles,
  X,
  Files,
  RefreshCw,
} from 'lucide-react'

import { cn } from '@/lib/utils'

// Hooks & Types
import { useAdminCategories, flattenTree, type CategoryNode } from '@/hooks/useCategories'

/* ========================================================================== */
/*  TYPES LOCAUX                                                              */
/* ========================================================================== */

interface CategoryFormData {
  nom: string
  parent_id: string | null
  image_url: string | null
  icone: string | null
  description: string | null
  ordre: number
  actif: boolean
  afficher_accueil: boolean
  ordre_accueil: number
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'homepage' | 'no-homepage' | 'with-image' | 'without-image'
type LevelFilter = 'all' | 'root' | 'child' | 'grandchild' | 'deep'
type ParentFilter = 'all' | 'none' | string
type SortBy = 'ordre' | 'nom' | 'niveau'

const DEFAULT_FORM_DATA: CategoryFormData = {
  nom: '',
  parent_id: null,
  image_url: null,
  icone: 'Tag',
  description: null,
  ordre: 0,
  actif: true,
  afficher_accueil: false,
  ordre_accueil: 0,
}

/* ========================================================================== */
/*  HELPERS                                                                   */
/* ========================================================================== */

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function getCategorySlug(cat: CategoryNode): string {
  return (cat as any).slug ?? (cat as any).slug_category ?? ''
}

function getCategoryPath(cat: CategoryNode): string {
  return cat.chemin_complet ?? (cat as any).path ?? cat.nom
}

function levelLabel(depth: number): string {
  if (depth === 0) return 'Racine'
  if (depth === 1) return 'Enfant'
  if (depth === 2) return 'Petit-enfant'
  if (depth === 3) return 'Arrière-petit-enfant'
  return `Niveau ${depth}`
}

/* ========================================================================== */
/*  COMPOSANT PRINCIPAL                                                       */
/* ========================================================================== */

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  // Données
  const { data: categories, isLoading, isError, refetch } = useAdminCategories()

  // Arbre aplati
  const flatCategories = useMemo(() => {
    if (!categories) return []
    return flattenTree(categories)
  }, [categories])

  // Maps utiles
  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryNode>()
    flatCategories.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [flatCategories])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, CategoryNode[]>()

    flatCategories.forEach((cat) => {
      const key = cat.parent_id ?? null
      const list = map.get(key) ?? []
      list.push(cat)
      map.set(key, list)
    })

    // Tri des enfants par ordre
    map.forEach((list) => {
      list.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
    })

    return map
  }, [flatCategories])

  const childCount = useMemo(() => {
    const map = new Map<string, number>()
    childrenByParent.forEach((children, parentId) => {
      if (parentId) map.set(parentId, children.length)
    })
    return map
  }, [childrenByParent])

  // États UI
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('all')
  const [filterParentId, setFilterParentId] = useState<ParentFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('ordre')
  const [maxDepth, setMaxDepth] = useState<number>(0) // 0 = illimité

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>(DEFAULT_FORM_DATA)

  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const initializedExpanded = useRef(false)

  /* -------------------------------------------------------------------------- */
  /*  INITIALISATION EXPANSION                                                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (initializedExpanded.current) return
    if (flatCategories.length === 0) return

    // Par défaut, on déplie les racines qui ont des enfants
    const rootsWithChildren = flatCategories
      .filter((cat) => cat.depth === 0 && (childCount.get(cat.id) ?? 0) > 0)
      .map((cat) => cat.id)

    setExpanded(new Set(rootsWithChildren))
    initializedExpanded.current = true
  }, [flatCategories, childCount])

  /* -------------------------------------------------------------------------- */
  /*  FILTRES                                                                   */
  /* -------------------------------------------------------------------------- */

  const hasActiveFilters = useMemo(() => {
    return (
      search.trim().length > 0 ||
      filterStatus !== 'all' ||
      filterLevel !== 'all' ||
      filterParentId !== 'all' ||
      sortBy !== 'ordre'
    )
  }, [search, filterStatus, filterLevel, filterParentId, sortBy])

  const matchesLevel = useCallback(
    (depth: number) => {
      if (filterLevel === 'all') return true
      if (filterLevel === 'root') return depth === 0
      if (filterLevel === 'child') return depth === 1
      if (filterLevel === 'grandchild') return depth === 2
      if (filterLevel === 'deep') return depth >= 3
      return true
    },
    [filterLevel]
  )

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase()

    let list = flatCategories.filter((cat) => {
      const slug = getCategorySlug(cat)
      const path = getCategoryPath(cat)

      const haystack = [cat.nom, path, cat.description, slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchSearch = !term || haystack.includes(term)

      let matchStatus = true
      if (filterStatus === 'active') matchStatus = cat.actif
      else if (filterStatus === 'inactive') matchStatus = !cat.actif
      else if (filterStatus === 'homepage') matchStatus = cat.afficher_accueil
      else if (filterStatus === 'no-homepage') matchStatus = !cat.afficher_accueil
      else if (filterStatus === 'with-image') matchStatus = Boolean(cat.image_url)
      else if (filterStatus === 'without-image') matchStatus = !cat.image_url

      const matchLevel = matchesLevel(cat.depth)

      let matchParent = true
      if (filterParentId === 'none') {
        matchParent = !cat.parent_id
      } else if (filterParentId !== 'all') {
        matchParent = cat.parent_id === filterParentId
      }

      return matchSearch && matchStatus && matchLevel && matchParent
    })

    if (sortBy === 'nom') {
      list = [...list].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    } else if (sortBy === 'niveau') {
      list = [...list].sort((a, b) => a.depth - b.depth || a.ordre - b.ordre)
    }

    return list
  }, [
    flatCategories,
    search,
    filterStatus,
    filterLevel,
    filterParentId,
    sortBy,
    matchesLevel,
  ])

  const isNodeVisibleInTree = useCallback(
    (cat: CategoryNode) => {
      if (hasActiveFilters) return true

      let parentId = cat.parent_id

      while (parentId) {
        const parent = categoryById.get(parentId)
        if (!parent) break

        if (!expanded.has(parentId)) {
          return false
        }

        parentId = parent.parent_id
      }

      return true
    },
    [hasActiveFilters, categoryById, expanded]
  )

  const visibleCategories = useMemo(() => {
    return filteredCategories.filter(isNodeVisibleInTree)
  }, [filteredCategories, isNodeVisibleInTree])

  /* -------------------------------------------------------------------------- */
  /*  STATS                                                                     */
  /* -------------------------------------------------------------------------- */

  const stats = useMemo(() => {
    const total = flatCategories.length
    const actifs = flatCategories.filter((c) => c.actif).length
    const homepage = flatCategories.filter((c) => c.afficher_accueil).length
    const racines = flatCategories.filter((c) => c.depth === 0).length
    const sansImage = flatCategories.filter((c) => !c.image_url).length

    return {
      total,
      actifs,
      inactifs: total - actifs,
      homepage,
      racines,
      sansImage,
    }
  }, [flatCategories])

  /* -------------------------------------------------------------------------- */
  /*  DESCENDANTS / CYCLES                                                      */
  /* -------------------------------------------------------------------------- */

  const getDescendantIds = useCallback(
    (rootId: string) => {
      const result = new Set<string>()
      const stack = [rootId]

      while (stack.length > 0) {
        const currentId = stack.pop()!
        const children = childrenByParent.get(currentId) ?? []

        for (const child of children) {
          if (!result.has(child.id)) {
            result.add(child.id)
            stack.push(child.id)
          }
        }
      }

      return result
    },
    [childrenByParent]
  )

  const prohibitedParentIds = useMemo(() => {
    if (!editingCategory) return new Set<string>()

    const descendants = getDescendantIds(editingCategory.id)
    descendants.add(editingCategory.id)

    return descendants
  }, [editingCategory, getDescendantIds])

  /* -------------------------------------------------------------------------- */
  /*  MUTATIONS API                                                             */
  /* -------------------------------------------------------------------------- */

  const invalidateCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['home-categories'] })
  }, [queryClient])

  // Créer ou modifier
  const saveMutation = useMutation({
    mutationFn: async (data: CategoryFormData & { id?: string }) => {
      const isEdit = !!data.id
      const url = isEdit ? `/api/admin/categories/${data.id}` : '/api/admin/categories'
      const method = isEdit ? 'PUT' : 'POST'

      const { id, ...body } = data

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }

      return res.json()
    },
    onSuccess: () => {
      invalidateCategories()
      setIsModalOpen(false)
      setEditingCategory(null)
      setFormData(DEFAULT_FORM_DATA)
      toast.addToast({
        type: 'success',
        message: editingCategory
          ? 'Catégorie modifiée avec succès !'
          : 'Catégorie créée avec succès !',
      })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur lors de la sauvegarde' })
    },
  })

  // Mise à jour partielle rapide
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CategoryFormData> }) => {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la mise à jour')
      }

      return res.json()
    },
    onSuccess: () => {
      invalidateCategories()
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur lors de la mise à jour' })
    },
  })

  // Suppression
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }
    },
    onSuccess: () => {
      invalidateCategories()
      setSelected(new Set())
      toast.addToast({
        type: 'success',
        message: 'Catégorie supprimée (et ses sous-catégories)',
      })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur lors de la suppression' })
    },
  })

  // Actions groupées
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<CategoryFormData> }) => {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/admin/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Échec mise à jour ${id}`)
          }

          return res.json()
        })
      )

      const failed = results.filter((r) => r.status === 'rejected')

      if (failed.length > 0) {
        throw new Error(`${failed.length} catégorie(s) n'ont pas pu être mises à jour.`)
      }
    },
    onSuccess: () => {
      invalidateCategories()
      toast.addToast({ type: 'success', message: 'Action groupée appliquée' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur action groupée' })
    },
  })

  // Suppression groupée
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Échec suppression ${id}`)
          }
        })
      )

      const failed = results.filter((r) => r.status === 'rejected')

      if (failed.length > 0) {
        throw new Error(`${failed.length} catégorie(s) n'ont pas pu être supprimées.`)
      }
    },
    onSuccess: () => {
      invalidateCategories()
      setSelected(new Set())
      toast.addToast({ type: 'success', message: 'Suppression groupée réussie' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur suppression groupée' })
    },
  })

  // Réordonnancement multiple
  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordre: number }[]) => {
      const results = await Promise.allSettled(
        updates.map(async ({ id, ordre }) => {
          const res = await fetch(`/api/admin/categories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordre }),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Échec réordonnancement ${id}`)
          }
        })
      )

      const failed = results.filter((r) => r.status === 'rejected')

      if (failed.length > 0) {
        throw new Error(`${failed.length} catégorie(s) n'ont pas pu être réordonnées.`)
      }
    },
    onSuccess: () => {
      invalidateCategories()
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur réordonnancement' })
    },
  })

  // Duplication
  const duplicateMutation = useMutation({
    mutationFn: async (category: CategoryNode) => {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: `${category.nom} (copie)`,
          parent_id: category.parent_id,
          image_url: category.image_url,
          icone: category.icone,
          description: category.description,
          ordre: category.ordre + 1,
          actif: false,
          afficher_accueil: false,
          ordre_accueil: 0,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la duplication')
      }

      return res.json()
    },
    onSuccess: () => {
      invalidateCategories()
      toast.addToast({ type: 'success', message: 'Catégorie dupliquée' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message || 'Erreur duplication' })
    },
  })

  /* -------------------------------------------------------------------------- */
  /*  HANDLERS UI                                                               */
  /* -------------------------------------------------------------------------- */

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    const allWithChildren = flatCategories
      .filter((cat) => (childCount.get(cat.id) ?? 0) > 0)
      .map((cat) => cat.id)

    setExpanded(new Set(allWithChildren))
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected = useMemo(() => {
    return (
      filteredCategories.length > 0 &&
      filteredCategories.every((cat) => selected.has(cat.id))
    )
  }, [filteredCategories, selected])

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredCategories.map((cat) => cat.id)))
    }
  }

  const clearSelection = () => {
    setSelected(new Set())
  }

  const resetFilters = () => {
    setSearch('')
    setFilterStatus('all')
    setFilterLevel('all')
    setFilterParentId('all')
    setSortBy('ordre')
    setMaxDepth(0)
  }

  const handleOpenCreate = () => {
    setEditingCategory(null)

    const rootSiblings = flatCategories.filter((c) => !c.parent_id)

    setFormData({
      ...DEFAULT_FORM_DATA,
      ordre: rootSiblings.length,
    })

    setIsModalOpen(true)
  }

  const handleOpenEdit = (category: CategoryNode) => {
    setEditingCategory(category)
    setFormData({
      nom: category.nom,
      parent_id: category.parent_id,
      image_url: category.image_url,
      icone: category.icone || 'Tag',
      description: category.description,
      ordre: category.ordre,
      actif: category.actif,
      afficher_accueil: category.afficher_accueil,
      ordre_accueil: category.ordre_accueil,
    })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setFormData(DEFAULT_FORM_DATA)
  }

  const handleParentChange = (value: string) => {
    const parentId = value || null

    setFormData((prev) => {
      let nextOrdre = prev.ordre

      if (!editingCategory) {
        const siblings = flatCategories.filter((c) => c.parent_id === parentId)
        nextOrdre = siblings.length
      }

      return {
        ...prev,
        parent_id: parentId,
        ordre: nextOrdre,
      }
    })
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.nom.trim()) {
      toast.addToast({ type: 'error', message: 'Le nom est obligatoire' })
      return
    }

    if (formData.parent_id && prohibitedParentIds.has(formData.parent_id)) {
      toast.addToast({
        type: 'error',
        message: 'Impossible de choisir cette catégorie parente (boucle hiérarchique).',
      })
      return
    }

    if (formData.parent_id && maxDepth > 0) {
      const parent = categoryById.get(formData.parent_id)
      if (parent && parent.depth + 1 > maxDepth) {
        toast.addToast({
          type: 'error',
          message: `Profondeur maximale autorisée : ${maxDepth}.`,
        })
        return
      }
    }

    saveMutation.mutate(
      editingCategory ? { ...formData, id: editingCategory.id } : formData
    )
  }

  const handleDelete = (category: CategoryNode) => {
    const descendants = getDescendantIds(category.id)
    const extra =
      descendants.size > 0
        ? `\nAttention : ${descendants.size} sous-catégorie(s) seront également supprimées.`
        : ''

    if (
      confirm(
        `Êtes-vous sûr de vouloir supprimer "${category.nom}" ?${extra}`
      )
    ) {
      deleteMutation.mutate(category.id)
    }
  }

  const handleBulkDelete = () => {
    if (selected.size === 0) return

    if (
      confirm(
        `Supprimer ${selected.size} catégorie(s) ?\nLes sous-catégories seront également supprimées.`
      )
    ) {
      bulkDeleteMutation.mutate(Array.from(selected))
    }
  }

  const handleQuickToggle = (
    category: CategoryNode,
    field: 'actif' | 'afficher_accueil'
  ) => {
    updateMutation.mutate({
      id: category.id,
      patch: {
        [field]: !category[field],
      } as Partial<CategoryFormData>,
    })
  }

  const handleBulkPatch = (patch: Partial<CategoryFormData>, successMessage: string) => {
    if (selected.size === 0) return

    bulkUpdateMutation.mutate(
      { ids: Array.from(selected), patch },
      // Le message global est déjà géré par onSuccess, mais on peut personnaliser si besoin.
    )

    toast.addToast({ type: 'info', message: successMessage })
  }

  const handleShowRootsOnHomepage = () => {
    const rootIds = flatCategories
      .filter((cat) => cat.depth === 0 && cat.actif)
      .map((cat) => cat.id)

    if (rootIds.length === 0) {
      toast.addToast({ type: 'error', message: 'Aucune catégorie racine active trouvée.' })
      return
    }

    bulkUpdateMutation.mutate({
      ids: rootIds,
      patch: { afficher_accueil: true },
    })
  }

  const handleMove = (category: CategoryNode, direction: 'up' | 'down') => {
    const siblings = flatCategories
      .filter((c) => c.parent_id === category.parent_id)
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))

    const currentIndex = siblings.findIndex((c) => c.id === category.id)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= siblings.length) return

    const newSiblings = [...siblings]
    const [moved] = newSiblings.splice(currentIndex, 1)
    newSiblings.splice(targetIndex, 0, moved)

    const updates = newSiblings.map((cat, index) => ({
      id: cat.id,
      ordre: index,
    }))

    reorderMutation.mutate(updates)
  }

  const handleDuplicate = (category: CategoryNode) => {
    duplicateMutation.mutate(category)
  }

  const handleCopyImageUrl = async (category: CategoryNode) => {
    const value = category.image_url || category.id

    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard non disponible')
      }

      await navigator.clipboard.writeText(value)
      setCopyingId(category.id)
      toast.addToast({
        type: 'success',
        message: category.image_url ? 'URL image copiée' : 'ID catégorie copié',
      })

      setTimeout(() => setCopyingId(null), 1500)
    } catch {
      toast.addToast({ type: 'error', message: 'Impossible de copier' })
    }
  }

  const handleExportJson = () => {
    const data = (selected.size > 0
      ? filteredCategories.filter((cat) => selected.has(cat.id))
      : filteredCategories
    ).map((cat) => ({
      id: cat.id,
      nom: cat.nom,
      parent_id: cat.parent_id,
      image_url: cat.image_url,
      icone: cat.icone,
      description: cat.description,
      ordre: cat.ordre,
      actif: cat.actif,
      afficher_accueil: cat.afficher_accueil,
      ordre_accueil: cat.ordre_accueil,
      profondeur: cat.depth,
      chemin: getCategoryPath(cat),
      slug: getCategorySlug(cat),
    }))

    downloadBlob(
      JSON.stringify(data, null, 2),
      `categories-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    )

    toast.addToast({ type: 'success', message: 'Export JSON généré' })
  }

  const handleExportCsv = () => {
    const rows = (selected.size > 0
      ? filteredCategories.filter((cat) => selected.has(cat.id))
      : filteredCategories
    ).map((cat) => [
      cat.id,
      cat.nom,
      cat.parent_id ?? '',
      cat.image_url ?? '',
      cat.icone ?? '',
      cat.description ?? '',
      cat.ordre,
      cat.actif,
      cat.afficher_accueil,
      cat.ordre_accueil,
      cat.depth,
      getCategoryPath(cat),
      getCategorySlug(cat),
    ])

    const headers = [
      'id',
      'nom',
      'parent_id',
      'image_url',
      'icone',
      'description',
      'ordre',
      'actif',
      'afficher_accueil',
      'ordre_accueil',
      'profondeur',
      'chemin',
      'slug',
    ]

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n')

    downloadBlob(
      csv,
      `categories-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8;'
    )

    toast.addToast({ type: 'success', message: 'Export CSV généré' })
  }

  /* -------------------------------------------------------------------------- */
  /*  DRAG & DROP REORDER                                                       */
  /* -------------------------------------------------------------------------- */

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (hasActiveFilters) return

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }

  const handleDragOver = (e: React.DragEvent, target: CategoryNode) => {
    if (!draggingId || hasActiveFilters) return

    const dragged = categoryById.get(draggingId)
    if (!dragged) return

    // Réordonnancement uniquement entre frères du même parent
    if (dragged.parent_id !== target.parent_id) return

    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(target.id)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, target: CategoryNode) => {
    e.preventDefault()
    setDragOverId(null)

    if (!draggingId || hasActiveFilters) {
      setDraggingId(null)
      return
    }

    const dragged = categoryById.get(draggingId)
    if (!dragged || dragged.parent_id !== target.parent_id) {
      setDraggingId(null)
      return
    }

    const siblings = flatCategories
      .filter((c) => c.parent_id === dragged.parent_id)
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))

    const withoutDragged = siblings.filter((c) => c.id !== dragged.id)
    const targetIndex = withoutDragged.findIndex((c) => c.id === target.id)

    if (targetIndex === -1) {
      setDraggingId(null)
      return
    }

    const newSiblings = [
      ...withoutDragged.slice(0, targetIndex),
      dragged,
      ...withoutDragged.slice(targetIndex),
    ]

    const updates = newSiblings.map((cat, index) => ({
      id: cat.id,
      ordre: index,
    }))

    reorderMutation.mutate(updates)
    setDraggingId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  /* -------------------------------------------------------------------------- */
  /*  RENDU                                                                     */
  /* -------------------------------------------------------------------------- */

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" variant="premium" label="Chargement des catégories..." />
      </div>
    )
  }

  if (isError) {
    return (
      <Container className="py-8">
        <Card variant="glass" className="p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={40} />
          <h2 className="text-xl font-semibold mb-2">Erreur de chargement</h2>
          <p className="text-muted-foreground mb-4">
            Impossible de charger les catégories administratives.
          </p>
          <Button variant="luxe" onClick={() => refetch()} leftIcon={<RefreshCw size={16} />}>
            Réessayer
          </Button>
        </Card>
      </Container>
    )
  }

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* ================================================================ */}
        {/*  EN-TÊTE                                                         */}
        {/* ================================================================ */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
              <Layers size={28} className="text-gold-500" />
              Gestion avancée des catégories
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.total} catégories · {stats.racines} racines · {stats.actifs} actives ·{' '}
              {stats.homepage} sur l’accueil · {stats.sansImage} sans image
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline-gold"
              size="sm"
              onClick={handleShowRootsOnHomepage}
              leftIcon={<Home size={16} />}
            >
              Racines sur accueil
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={expandAll}
              leftIcon={<ChevronDown size={16} />}
            >
              Tout déplier
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={collapseAll}
              leftIcon={<ChevronRight size={16} />}
            >
              Tout replier
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              leftIcon={<Files size={16} />}
            >
              JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              leftIcon={<Download size={16} />}
            >
              CSV
            </Button>

            <Button
              variant="luxe"
              onClick={handleOpenCreate}
              leftIcon={<Plus size={16} />}
            >
              Ajouter une catégorie
            </Button>
          </div>
        </div>

        {/* ================================================================ */}
        {/*  STATS RAPIDES                                                   */}
        {/* ================================================================ */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            {
              label: 'Total',
              value: stats.total,
              icon: <Layers size={16} className="text-gold-500" />,
              onClick: () => {
                resetFilters()
              },
            },
            {
              label: 'Racines',
              value: stats.racines,
              icon: <FolderTree size={16} className="text-emerald-500" />,
              onClick: () => {
                setFilterLevel('root')
                setFilterParentId('all')
              },
            },
            {
              label: 'Actives',
              value: stats.actifs,
              icon: <Eye size={16} className="text-green-500" />,
              onClick: () => setFilterStatus('active'),
            },
            {
              label: 'Inactives',
              value: stats.inactifs,
              icon: <EyeOff size={16} className="text-red-500" />,
              onClick: () => setFilterStatus('inactive'),
            },
            {
              label: 'Accueil',
              value: stats.homepage,
              icon: <Home size={16} className="text-blue-500" />,
              onClick: () => setFilterStatus('homepage'),
            },
            {
              label: 'Sans image',
              value: stats.sansImage,
              icon: <ImageIcon size={16} className="text-amber-500" />,
              onClick: () => setFilterStatus('without-image'),
            },
          ].map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={s.onClick}
              className="bg-card rounded-xl p-3 border border-border hover:border-gold-400/60 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">{s.icon}</div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                  <p className="font-bold">{s.value}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* ================================================================ */}
        {/*  BARRE D'OUTILS                                                  */}
        {/* ================================================================ */}
        <Card variant="glass" className="p-4 mb-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <Input
                variant="glass"
                placeholder="Rechercher nom, slug, description, chemin..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                allowClear
                onClear={() => setSearch('')}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
              >
                <option value="all">Tous statuts</option>
                <option value="active">Actives</option>
                <option value="inactive">Inactives</option>
                <option value="homepage">Sur accueil</option>
                <option value="no-homepage">Pas sur accueil</option>
                <option value="with-image">Avec image</option>
                <option value="without-image">Sans image</option>
              </select>

              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as LevelFilter)}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
              >
                <option value="all">Tous niveaux</option>
                <option value="root">Racines</option>
                <option value="child">Enfants</option>
                <option value="grandchild">Petits-enfants</option>
                <option value="deep">4ᵉ+ niveaux</option>
              </select>

              <select
                value={filterParentId}
                onChange={(e) => setFilterParentId(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50 max-w-[220px]"
              >
                <option value="all">Tous parents</option>
                <option value="none">Sans parent (racines)</option>
                {flatCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {'↳ '.repeat(cat.depth)}
                    {cat.nom}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
              >
                <option value="ordre">Ordre personnalisé</option>
                <option value="nom">Nom A-Z</option>
                <option value="niveau">Niveau puis ordre</option>
              </select>

              <select
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
                title="Limite de profondeur pour la création/édition"
              >
                <option value={0}>Profondeur illimitée</option>
                <option value={1}>Max 1 niveau</option>
                <option value={2}>Max 2 niveaux</option>
                <option value={3}>Max 3 niveaux</option>
                <option value={4}>Max 4 niveaux</option>
                <option value={5}>Max 5 niveaux</option>
                <option value={6}>Max 6 niveaux</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                leftIcon={<RotateCcw size={14} />}
              >
                Réinitialiser
              </Button>
            </div>
          </div>

          {/* Actions groupées */}
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-border"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold" size="sm">
                  {selected.size} sélectionnée(s)
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleBulkPatch({ actif: true }, 'Activation en cours...')
                  }
                  leftIcon={<Eye size={14} />}
                >
                  Activer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleBulkPatch({ actif: false }, 'Désactivation en cours...')
                  }
                  leftIcon={<EyeOff size={14} />}
                >
                  Désactiver
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleBulkPatch({ afficher_accueil: true }, 'Affichage accueil...')
                  }
                  leftIcon={<Home size={14} />}
                >
                  Mettre sur accueil
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleBulkPatch({ afficher_accueil: false }, 'Masquage accueil...')
                  }
                  leftIcon={<X size={14} />}
                >
                  Retirer accueil
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={handleBulkDelete}
                  leftIcon={<Trash2 size={14} />}
                >
                  Supprimer
                </Button>

                <Button variant="ghost" size="sm" onClick={clearSelection} leftIcon={<X size={14} />}>
                  Annuler sélection
                </Button>
              </div>
            </motion.div>
          )}
        </Card>

        {/* ================================================================ */}
        {/*  LISTE / ARBORESCENCE                                            */}
        {/* ================================================================ */}
        {visibleCategories.length === 0 ? (
          <Card variant="glass" className="p-10 text-center text-muted-foreground">
            <Filter size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Aucune catégorie ne correspond à vos critères.</p>
            <p className="text-sm mt-1">
              Essayez de réinitialiser les filtres ou de créer une nouvelle catégorie.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >
                {allFilteredSelected ? (
                  <CheckSquare size={16} className="text-gold-500" />
                ) : (
                  <Square size={16} />
                )}
                Tout sélectionner / désélectionner
              </button>

              <span className="text-xs text-muted-foreground">
                {visibleCategories.length} affichée(s) / {filteredCategories.length} filtrée(s) /{' '}
                {flatCategories.length} totale(s)
              </span>
            </div>

            <AnimatePresence initial={false}>
              {visibleCategories.map((cat) => {
                const hasChildren = (childCount.get(cat.id) ?? 0) > 0
                const isExpanded = expanded.has(cat.id)
                const isSelected = selected.has(cat.id)
                const isDragOver = dragOverId === cat.id
                const isDragging = draggingId === cat.id

                const siblings = flatCategories
                  .filter((c) => c.parent_id === cat.parent_id)
                  .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))

                const siblingIndex = siblings.findIndex((c) => c.id === cat.id)
                const totalSiblings = siblings.length

                return (
                  <motion.div
                    key={cat.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div
                      draggable={!hasActiveFilters}
                      onDragStart={(e) => handleDragStart(e, cat.id)}
                      onDragOver={(e) => handleDragOver(e, cat)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, cat)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'transition-all',
                        isDragging && 'opacity-40',
                        isDragOver && 'ring-2 ring-gold-400/60 rounded-xl'
                      )}
                    >
                      <Card
                        variant="glass"
                        className={cn(
                          'group transition-all hover:border-gold-400/40',
                          !cat.actif && 'opacity-65',
                          isSelected && 'border-gold-400/70 bg-gold-400/5'
                        )}
                      >
                        <CardContent className="flex items-center gap-3 p-3 flex-wrap xl:flex-nowrap">
                          {/* Checkbox + expansion + drag */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSelect(cat.id)}
                              className="p-1 rounded hover:bg-muted transition"
                              aria-label="Sélectionner"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-gold-500" />
                              ) : (
                                <Square size={16} className="text-muted-foreground" />
                              )}
                            </button>

                            {hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(cat.id)}
                                className="p-1 rounded hover:bg-muted transition"
                                aria-label={isExpanded ? 'Replier' : 'Déplier'}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={16} className="text-muted-foreground" />
                                ) : (
                                  <ChevronRight size={16} className="text-muted-foreground" />
                                )}
                              </button>
                            ) : (
                              <div className="w-6" />
                            )}

                            {!hasActiveFilters && (
                              <GripVertical
                                size={16}
                                className="text-muted-foreground/50 cursor-grab active:cursor-grabbing"
                              />
                            )}
                          </div>

                          {/* Image + nom */}
                          <div
                            className="flex items-center gap-3 min-w-[240px] flex-1"
                            style={{ paddingLeft: `${cat.depth * 22}px` }}
                          >
                            <div className="w-11 h-11 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 border flex items-center justify-center">
                              {cat.image_url ? (
                                <img
                                  src={cat.image_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon size={18} className="text-muted-foreground" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm truncate">{cat.nom}</p>

                                <Badge variant="neutral" size="sm">
                                  N{cat.depth}
                                </Badge>

                                {getCategorySlug(cat) && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                                    /{getCategorySlug(cat)}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-muted-foreground truncate">
                                {getCategoryPath(cat) || 'Racine'}
                              </p>
                            </div>
                          </div>

                          {/* Badges */}
                          <div className="flex gap-2 flex-wrap justify-center xl:justify-start min-w-[220px]">
                            {cat.actif ? (
                              <Badge variant="accent" size="sm">
                                <Eye size={12} className="mr-1" /> Visible
                              </Badge>
                            ) : (
                              <Badge variant="danger" size="sm">
                                <EyeOff size={12} className="mr-1" /> Masquée
                              </Badge>
                            )}

                            {cat.afficher_accueil ? (
                              <Badge variant="gold" size="sm">
                                <Home size={12} className="mr-1" /> Accueil
                              </Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">
                                Hors accueil
                              </Badge>
                            )}

                            {cat.icone && (
                              <Badge variant="neutral" size="sm">
                                {cat.icone}
                              </Badge>
                            )}

                            <Badge variant="neutral" size="sm">
                              Ordre {cat.ordre}
                            </Badge>

                            {(childCount.get(cat.id) ?? 0) > 0 && (
                              <Badge variant="neutral" size="sm">
                                {childCount.get(cat.id)} enfant(s)
                              </Badge>
                            )}
                          </div>

                          {/* Actions rapides */}
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Basculer visible / masquée"
                              onClick={() => handleQuickToggle(cat, 'actif')}
                            >
                              {cat.actif ? <EyeOff size={14} /> : <Eye size={14} />}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Basculer accueil"
                              onClick={() => handleQuickToggle(cat, 'afficher_accueil')}
                            >
                              <Home size={14} className={cat.afficher_accueil ? 'text-gold-500' : ''} />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Monter"
                              onClick={() => handleMove(cat, 'up')}
                              disabled={siblingIndex === 0 || reorderMutation.isPending || hasActiveFilters}
                            >
                              <ArrowUp size={14} />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Descendre"
                              onClick={() => handleMove(cat, 'down')}
                              disabled={
                                siblingIndex === totalSiblings - 1 ||
                                reorderMutation.isPending ||
                                hasActiveFilters
                              }
                            >
                              <ArrowDown size={14} />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Copier URL image ou ID"
                              onClick={() => handleCopyImageUrl(cat)}
                            >
                              {copyingId === cat.id ? (
                                <Check size={14} className="text-green-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Dupliquer"
                              onClick={() => handleDuplicate(cat)}
                              disabled={duplicateMutation.isPending}
                            >
                              {duplicateMutation.isPending ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Sparkles size={14} />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              title="Modifier"
                              onClick={() => handleOpenEdit(cat)}
                            >
                              <Edit2 size={14} />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              title="Supprimer"
                              onClick={() => handleDelete(cat)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ==================================================================== */}
      {/*  MODAL CRÉATION / ÉDITION                                            */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        size="md"
        accent="gold"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Infos structurelles */}
          {editingCategory && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                <strong>ID :</strong> <span className="font-mono">{editingCategory.id}</span>
              </p>
              <p>
                <strong>Niveau :</strong> {levelLabel(editingCategory.depth)}
              </p>
              <p>
                <strong>Chemin :</strong> {getCategoryPath(editingCategory)}
              </p>
              {getCategorySlug(editingCategory) && (
                <p>
                  <strong>Slug :</strong>{' '}
                  <span className="font-mono">/{getCategorySlug(editingCategory)}</span>
                </p>
              )}
            </div>
          )}

          {/* Nom */}
          <Input
            label="Nom de la catégorie *"
            value={formData.nom}
            onChange={(e) => setFormData((prev) => ({ ...prev, nom: e.target.value }))}
            placeholder="Ex: Smartphones"
            required
          />

          {/* Catégorie parente */}
          <div>
            <label className="text-sm font-medium mb-1 block">
              Catégorie parente
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Laisser vide pour une catégorie racine. Vous pouvez créer une hiérarchie :
              parent → enfant → petit-enfant → 4ᵉ niveau → 5ᵉ niveau, etc.
            </p>

            <select
              value={formData.parent_id || ''}
              onChange={(e) => handleParentChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
            >
              <option value="">Aucune (Racine)</option>

              {flatCategories
                .filter((c) => !prohibitedParentIds.has(c.id))
                .map((c) => {
                  const wouldBeDepth = c.depth + 1
                  const exceedsMaxDepth = maxDepth > 0 && wouldBeDepth > maxDepth

                  return (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={exceedsMaxDepth}
                      style={{ paddingLeft: `${c.depth * 14}px` }}
                    >
                      {'↳ '.repeat(c.depth)}
                      {c.nom}
                      {exceedsMaxDepth ? ' — profondeur max atteinte' : ''}
                    </option>
                  )
                })}
            </select>

            {maxDepth > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Limite UI active : profondeur maximale {maxDepth}.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Icône */}
            <div>
              <label className="text-sm font-medium mb-1 block">Icône (Lucide)</label>
              <IconPicker
                value={formData.icone || 'Tag'}
                onChange={(icon) => setFormData((prev) => ({ ...prev, icone: icon }))}
              />
            </div>

            {/* Ordre */}
            <Input
              label="Ordre d'affichage"
              type="number"
              value={formData.ordre}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  ordre: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </div>

          {/* Image */}
          <div>
            <label className="text-sm font-medium mb-2 block">Image de la catégorie</label>
            <PhotoUpload
              onUpload={(url) => setFormData((prev) => ({ ...prev, image_url: url }))}
              bucket="photos-produits"
              folder="categories"
              label={formData.image_url ? "Changer l'image" : "Uploader une image"}
              aspectRatio="square"
              size="md"
              defaultImage={formData.image_url || undefined}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-1 block">Description (optionnelle)</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={3}
              className="w-full rounded-xl border border-border bg-card p-3 text-sm focus:ring-2 focus:ring-gold-500/50 resize-none"
              placeholder="Courte description pour le SEO..."
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <label className="flex items-center justify-between p-3 rounded-lg bg-card border border-border cursor-pointer hover:bg-gold-400/5 transition">
              <div>
                <span className="font-medium text-sm">Visible sur le site</span>
                <p className="text-xs text-muted-foreground">
                  La catégorie apparaîtra dans les menus, la recherche et les pages publiques.
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.actif}
                onChange={() =>
                  setFormData((prev) => ({ ...prev, actif: !prev.actif }))
                }
                className="w-5 h-5 text-gold-500 rounded focus:ring-gold-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-card border border-border cursor-pointer hover:bg-gold-400/5 transition">
              <div>
                <span className="font-medium text-sm text-gold-600">
                  Afficher sur la page d'accueil
                </span>
                <p className="text-xs text-muted-foreground">
                  Apparaîtra dans la section “Catégories populaires”. Pour l’affichage actuel,
                  privilégie les catégories racines.
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.afficher_accueil}
                onChange={() =>
                  setFormData((prev) => ({ ...prev, afficher_accueil: !prev.afficher_accueil }))
                }
                className="w-5 h-5 text-gold-500 rounded focus:ring-gold-500"
              />
            </label>

            {formData.afficher_accueil && (
              <Input
                label="Ordre sur la page d'accueil"
                type="number"
                value={formData.ordre_accueil}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    ordre_accueil: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="mt-2"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={handleCloseModal}
            >
              Annuler
            </Button>

            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => setFormData(DEFAULT_FORM_DATA)}
              leftIcon={<RotateCcw size={16} />}
            >
              Réinitialiser
            </Button>

            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={saveMutation.isPending}
              leftIcon={<Save size={16} />}
            >
              {editingCategory ? 'Enregistrer les modifications' : 'Créer la catégorie'}
            </Button>
          </div>
        </form>
      </Modal>
    </Container>
  )
}