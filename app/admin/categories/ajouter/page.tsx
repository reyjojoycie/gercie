//app/admin/categories/ajouter/page.tsx

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

// UI Components
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import PhotoUpload from '@/components/PhotoUpload'
import { IconPicker } from '@/components/admin/IconPicker'

// Icons
import {
  ArrowLeft,
  Save,
  Layers,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Home,
  RotateCcw,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Search,
  ClipboardCopy,
  Check,
  AlertCircle,
  Trash2,
  Plus,
  Sparkles,
  Package,
  Circle,
  Settings2,
  HardDrive,
  Keyboard,
} from 'lucide-react'

import { cn } from '@/lib/utils'

// Hooks & Types
import { useAdminCategories, flattenTree, type CategoryNode } from '@/hooks/useCategories'

/* ========================================================================== */
/*  CONSTANTES                                                                */
/* ========================================================================== */

const DRAFT_KEY = 'admin:category:add:draft'
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/* ========================================================================== */
/*  SCHÉMA DE VALIDATION                                                      */
/* ========================================================================== */

const categorySchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(MAX_NAME_LENGTH, `Le nom ne doit pas dépasser ${MAX_NAME_LENGTH} caractères`),

  parent_id: z
    .union([z.literal(''), z.string().regex(UUID_REGEX, 'ID parent invalide')])
    .optional(),

  image_url: z
    .union([z.literal(''), z.string().url("URL d'image invalide")])
    .optional(),

  icone: z.string().min(1, 'Veuillez sélectionner une icône'),

  description: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH, `La description ne doit pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères`)
    .optional(),

  ordre: z.coerce
    .number()
    .int("L'ordre doit être un nombre entier")
    .min(0, "L'ordre doit être positif")
    .max(9999, "L'ordre ne doit pas dépasser 9999")
    .default(0),

  actif: z.boolean().default(true),

  afficher_accueil: z.boolean().default(false),

  ordre_accueil: z.coerce
    .number()
    .int("L'ordre d'accueil doit être un nombre entier")
    .min(0, "L'ordre d'accueil doit être positif")
    .max(9999, "L'ordre d'accueil ne doit pas dépasser 9999")
    .default(0),
})

type CategoryFormValues = z.infer<typeof categorySchema>
type SubmitAction = 'close' | 'continue' | 'child'

const defaultValues: CategoryFormValues = {
  nom: '',
  parent_id: '',
  image_url: '',
  icone: 'Tag',
  description: '',
  ordre: 0,
  actif: true,
  afficher_accueil: false,
  ordre_accueil: 0,
}

/* ========================================================================== */
/*  HELPERS                                                                   */
/* ========================================================================== */

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function levelLabel(depth: number): string {
  if (depth === 0) return 'Racine'
  if (depth === 1) return 'Enfant'
  if (depth === 2) return 'Petit-enfant'
  if (depth === 3) return 'Arrière-petit-enfant'
  return `Niveau ${depth}`
}

function nowTime(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ========================================================================== */
/*  COMPOSANT PRINCIPAL                                                       */
/* ========================================================================== */

export default function AjouterCategoriePage() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  // États UI
  const [parentSearch, setParentSearch] = useState('')
  const [maxDepth, setMaxDepth] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false)

  // Données catégories existantes
  const {
    data: categories,
    isLoading: isLoadingCats,
    isError: isErrorCats,
    refetch: refetchCategories,
  } = useAdminCategories()

  const flatCategories = useMemo(() => {
    return categories ? flattenTree(categories) : []
  }, [categories])

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

    map.forEach((list) => {
      list.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
    })

    return map
  }, [flatCategories])

  // Formulaire
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues,
    mode: 'onChange',
  })

  const nom = watch('nom') ?? ''
  const parentId = watch('parent_id') ?? ''
  const imageUrl = watch('image_url') ?? ''
  const icone = watch('icone') ?? 'Tag'
  const description = watch('description') ?? ''
  const ordre = watch('ordre') ?? 0
  const actif = watch('actif') ?? true
  const afficherAccueil = watch('afficher_accueil') ?? false
  const ordreAccueil = watch('ordre_accueil') ?? 0

  // Données dérivées
  const selectedParent = parentId ? categoryById.get(parentId) : undefined
  const newDepth = selectedParent ? selectedParent.depth + 1 : 0

  const ancestorChain = useMemo(() => {
    if (!parentId) return []

    const chain: CategoryNode[] = []
    let current = categoryById.get(parentId)

    while (current) {
      chain.unshift(current)
      current = current.parent_id ? categoryById.get(current.parent_id) : undefined
    }

    return chain
  }, [parentId, categoryById])

  const hierarchyPreview = useMemo(() => {
    return [...ancestorChain.map((c) => c.nom), nom.trim() || 'Nouvelle catégorie']
  }, [ancestorChain, nom])

  const slugPreview = useMemo(() => slugify(nom), [nom])

  const siblingCount = childrenByParent.get(parentId || null)?.length ?? 0
  const suggestedOrder = siblingCount + 1

  const filteredParentOptions = useMemo(() => {
    const term = parentSearch.trim().toLowerCase()

    return flatCategories.filter((cat) => {
      const path = cat.chemin_complet || cat.nom
      return (
        !term ||
        cat.nom.toLowerCase().includes(term) ||
        path.toLowerCase().includes(term)
      )
    })
  }, [flatCategories, parentSearch])

  const parentOptionsForSelect = useMemo(() => {
    const list = [...filteredParentOptions]

    if (selectedParent && !list.some((c) => c.id === selectedParent.id)) {
      list.unshift(selectedParent)
    }

    return list
  }, [filteredParentOptions, selectedParent])

  const checklist = useMemo(() => {
    return [
      {
        label: 'Nom valide',
        done: nom.trim().length >= 2,
        required: true,
        info: `${nom.trim().length}/${MAX_NAME_LENGTH}`,
      },
      {
        label: 'Icône sélectionnée',
        done: Boolean(icone),
        required: true,
        info: icone || 'Aucune',
      },
      {
        label: 'Position hiérarchique',
        done: true,
        required: false,
        info: parentId ? `Sous : ${selectedParent?.nom ?? 'Inconnu'}` : 'Catégorie racine',
      },
      {
        label: 'Image facultative',
        done: Boolean(imageUrl),
        required: false,
        info: imageUrl ? 'Image définie' : 'Sans image',
      },
      {
        label: 'Description facultative',
        done: description.trim().length > 0,
        required: false,
        info: `${description.trim().length}/${MAX_DESCRIPTION_LENGTH}`,
      },
      {
        label: 'Catégorie visible',
        done: actif,
        required: false,
        info: actif ? 'Visible sur le site' : 'Masquée',
      },
      {
        label: 'Affichage accueil',
        done: afficherAccueil,
        required: false,
        info: afficherAccueil ? `Ordre accueil : ${ordreAccueil}` : 'Non affichée',
      },
    ]
  }, [
    afficherAccueil,
    actif,
    description,
    icone,
    imageUrl,
    nom,
    ordreAccueil,
    parentId,
    selectedParent,
  ])

  /* -------------------------------------------------------------------------- */
  /*  BROUILLON LOCAL                                                           */
  /* -------------------------------------------------------------------------- */

  // Restaurer le brouillon au montage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<CategoryFormValues>
      reset({ ...defaultValues, ...parsed })
      setHasRestoredDraft(true)
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [reset])

  // Sauvegarder automatiquement le brouillon
  useEffect(() => {
    if (!isDirty) return

    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(getValues()))
        setDraftSavedAt(nowTime())
      } catch {
        // Stockage plein ou indisponible : on ignore silencieusement.
      }
    }, 700)

    return () => clearTimeout(timeout)
  }, [isDirty, getValues])

  // Avertissement si fermeture avec modifications non enregistrées
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  /* -------------------------------------------------------------------------- */
  /*  MUTATION CRÉATION                                                         */
  /* -------------------------------------------------------------------------- */

  const createMutation = useMutation({
    mutationFn: async ({
      values,
      action,
    }: {
      values: CategoryFormValues
      action: SubmitAction
    }) => {
      const payload = {
        nom: values.nom.trim(),
        parent_id: values.parent_id || null,
        image_url: values.image_url || null,
        icone: values.icone || 'Tag',
        description: values.description?.trim() || null,
        ordre: Number(values.ordre) || 0,
        actif: Boolean(values.actif),
        afficher_accueil: Boolean(values.afficher_accueil),
        ordre_accueil: Number(values.ordre_accueil) || 0,
      }

      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création de la catégorie')
      }

      const json = await res.json()

      return {
        action,
        created: json?.data ?? json,
      }
    },
    onSuccess: ({ action, created }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['home-categories'] })

      localStorage.removeItem(DRAFT_KEY)
      setDraftSavedAt(null)
      setHasRestoredDraft(false)

      const current = getValues()

      if (action === 'close') {
        toast.addToast({
          type: 'success',
          message: 'Catégorie créée avec succès !',
        })
        router.push('/admin/categories')
        router.refresh()
        return
      }

      if (action === 'continue') {
        toast.addToast({
          type: 'success',
          message: 'Catégorie créée. Formulaire prêt pour une nouvelle catégorie.',
        })

        reset({
          ...defaultValues,
          parent_id: current.parent_id ?? '',
          icone: current.icone ?? 'Tag',
          actif: current.actif ?? true,
          ordre: Number(current.ordre ?? 0) + 1,
        })

        return
      }

      // action === 'child'
      const newId = typeof created?.id === 'string' ? created.id : undefined

      if (newId) {
        toast.addToast({
          type: 'success',
          message: 'Catégorie créée. Vous pouvez maintenant ajouter sa sous-catégorie.',
        })

        reset({
          ...defaultValues,
          parent_id: newId,
          ordre: 0,
          actif: true,
        })
      } else {
        toast.addToast({
          type: 'success',
          message: 'Catégorie créée avec succès !',
        })
        router.push('/admin/categories')
        router.refresh()
      }
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err.message || 'Erreur lors de la création de la catégorie',
      })
    },
  })

  /* -------------------------------------------------------------------------- */
  /*  SUBMISSION                                                                */
  /* -------------------------------------------------------------------------- */

  const submitValues = useCallback(
    (values: CategoryFormValues, action: SubmitAction) => {
      if (maxDepth > 0 && values.parent_id) {
        const parent = categoryById.get(values.parent_id)

        if (parent && parent.depth + 1 > maxDepth) {
          toast.addToast({
            type: 'error',
            message: `Profondeur maximale autorisée : ${maxDepth}.`,
          })
          return
        }
      }

      createMutation.mutate({ values, action })
    },
    [categoryById, createMutation, maxDepth, toast]
  )

  const handleCreate = useCallback(
    (action: SubmitAction) => {
      handleSubmit((values) => submitValues(values, action))()
    },
    [handleSubmit, submitValues]
  )

  // Raccourci clavier Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleCreate('close')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleCreate])

  /* -------------------------------------------------------------------------- */
  /*  ACTIONS UI                                                                */
  /* -------------------------------------------------------------------------- */

  const applySuggestedOrder = useCallback(() => {
    setValue('ordre', suggestedOrder, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }, [setValue, suggestedOrder])

  const handleImageUrlChange = useCallback(
    (value: string) => {
      setValue('image_url', value.trim(), {
        shouldDirty: true,
        shouldValidate: true,
      })
    },
    [setValue]
  )

  const copySlug = useCallback(async () => {
    if (!slugPreview) return

    try {
      await navigator.clipboard.writeText(slugPreview)
      setCopiedSlug(true)
      setTimeout(() => setCopiedSlug(false), 1500)
    } catch {
      toast.addToast({
        type: 'error',
        message: 'Impossible de copier le slug',
      })
    }
  }, [slugPreview, toast])

  const handleResetForm = useCallback(() => {
    reset(defaultValues)
    localStorage.removeItem(DRAFT_KEY)
    setDraftSavedAt(null)
    setHasRestoredDraft(false)
    toast.addToast({
      type: 'success',
      message: 'Formulaire réinitialisé',
    })
  }, [reset, toast])

  const handleDeleteDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY)
    setDraftSavedAt(null)
    setHasRestoredDraft(false)
    toast.addToast({
      type: 'success',
      message: 'Brouillon supprimé',
    })
  }, [toast])

  /* -------------------------------------------------------------------------- */
  /*  RENDU                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <Container className="py-8 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* ================================================================ */}
        {/*  EN-TÊTE                                                         */}
        {/* ================================================================ */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <Link
              href="/admin/categories"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-500 transition-colors mb-3"
            >
              <ArrowLeft size={16} />
              Retour aux catégories
            </Link>

            <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
              <Layers size={28} className="text-gold-500" />
              Nouvelle catégorie
            </h1>

            <p className="text-sm text-muted-foreground mt-1">
              Créez une catégorie racine ou une sous-catégorie à n’importe quel niveau.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{levelLabel(newDepth)}</Badge>

            {hasRestoredDraft && (
              <Badge variant="gold">
                <HardDrive size={12} className="mr-1" />
                Brouillon restauré
              </Badge>
            )}

            {draftSavedAt && (
              <Badge variant="neutral">
                <Check size={12} className="mr-1" />
                Enregistré {draftSavedAt}
              </Badge>
            )}
          </div>
        </div>

        {/* ================================================================ */}
        {/*  GRILLE PRINCIPALE                                               */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* -------------------------------------------------------------- */}
          {/*  FORMULAIRE                                                    */}
          {/* -------------------------------------------------------------- */}
          <form
            onSubmit={handleSubmit((values) => submitValues(values, 'close'))}
            className="xl:col-span-2 space-y-6"
          >
            {/* ============================================================ */}
            {/*  SECTION IDENTITÉ                                            */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Layers size={18} className="text-gold-500" />
                    Identité
                  </h2>

                  <Badge variant="neutral">
                    {nom.trim().length}/{MAX_NAME_LENGTH}
                  </Badge>
                </div>

                <Input
                  variant="glass"
                  label="Nom de la catégorie *"
                  placeholder="Ex : Smartphones, Chaussures, Accessoires..."
                  {...register('nom')}
                  error={errors.nom?.message}
                />

                {/* Slug prévisionnel */}
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Slug prévisionnel
                      </p>
                      <p className="text-sm font-mono truncate">
                        /{slugPreview || '...'}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={copySlug}
                      disabled={!slugPreview}
                      title="Copier le slug"
                    >
                      {copiedSlug ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <ClipboardCopy size={14} />
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground mt-2">
                    Ce slug est affiché à titre indicatif. Si votre API génère automatiquement
                    le slug, il n’est pas envoyé ici.
                  </p>
                </div>

                {/* Icône */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Icône
                  </label>
                  <IconPicker
                    value={icone || 'Tag'}
                    onChange={(value) =>
                      setValue('icone', value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  {errors.icone && (
                    <p className="text-red-500 text-xs mt-1">{errors.icone.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  SECTION HIÉRARCHIE                                          */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FolderTree size={18} className="text-gold-500" />
                    Hiérarchie
                  </h2>

                  <Badge variant="neutral">{levelLabel(newDepth)}</Badge>
                </div>

                {isErrorCats && (
                  <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span>
                      Impossible de charger la liste des catégories parentes.
                      Vous pouvez quand même créer une catégorie racine.
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refetchCategories()}
                    >
                      Réessayer
                    </Button>
                  </div>
                )}

                {/* Recherche parent */}
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                    size={18}
                  />
                  <Input
                    variant="glass"
                    placeholder="Rechercher une catégorie parente..."
                    value={parentSearch}
                    onChange={(e) => setParentSearch(e.target.value)}
                    className="pl-10"
                    allowClear
                    onClear={() => setParentSearch('')}
                  />
                </div>

                {/* Sélection parent */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Catégorie parente
                  </label>

                  {isLoadingCats ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
                      <Spinner size="sm" />
                      Chargement des catégories...
                    </div>
                  ) : (
                    <select
                      {...register('parent_id')}
                      disabled={isErrorCats}
                      className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50 disabled:opacity-60"
                    >
                      <option value="">Aucune (Catégorie racine)</option>

                      {parentOptionsForSelect.map((cat) => {
                        const wouldBeDepth = cat.depth + 1
                        const exceedsMaxDepth = maxDepth > 0 && wouldBeDepth > maxDepth

                        return (
                          <option
                            key={cat.id}
                            value={cat.id}
                            disabled={exceedsMaxDepth}
                            style={{ paddingLeft: `${cat.depth * 14 + 8}px` }}
                          >
                            {'↳ '.repeat(cat.depth)}
                            {cat.nom}
                            {exceedsMaxDepth ? ' — profondeur max atteinte' : ''}
                          </option>
                        )
                      })}
                    </select>
                  )}

                  {errors.parent_id && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.parent_id.message}
                    </p>
                  )}
                </div>

                {/* Aperçu chemin */}
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <p>
                    <strong>Chemin :</strong>{' '}
                    <span className="font-mono break-words">
                      {hierarchyPreview.join(' / ')}
                    </span>
                  </p>

                  <p>
                    <strong>Niveau :</strong> {levelLabel(newDepth)}
                  </p>

                  {selectedParent ? (
                    <p>
                      <strong>Parent :</strong> {selectedParent.nom}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Cette catégorie sera une racine du catalogue.
                    </p>
                  )}
                </div>

                {/* Ordre + profondeur */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Input
                      variant="glass"
                      label="Ordre d'affichage"
                      type="number"
                      placeholder="0"
                      {...register('ordre', { valueAsNumber: true })}
                      error={errors.ordre?.message}
                    />

                    <p className="text-xs text-muted-foreground mt-1">
                      Suggéré : <strong>{suggestedOrder}</strong>
                    </p>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      fullWidth
                      onClick={applySuggestedOrder}
                      leftIcon={<Sparkles size={14} />}
                    >
                      Ordre auto
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Profondeur maximale autorisée <span className="text-muted-foreground font-normal">(UI seulement)</span>
                  </label>

                  <select
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:ring-2 focus:ring-gold-500/50"
                  >
                    <option value={0}>Illimitée</option>
                    <option value={1}>1 niveau maximum</option>
                    <option value={2}>2 niveaux maximum</option>
                    <option value={3}>3 niveaux maximum</option>
                    <option value={4}>4 niveaux maximum</option>
                    <option value={5}>5 niveaux maximum</option>
                    <option value={6}>6 niveaux maximum</option>
                  </select>

                  <p className="text-xs text-muted-foreground mt-1">
                    Cette limite empêche uniquement la sélection d’un parent trop profond
                    dans ce formulaire. Elle n’est pas envoyée à l’API.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  SECTION MÉDIA                                               */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardContent className="p-6 space-y-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ImageIcon size={18} className="text-gold-500" />
                  Image de la catégorie
                </h2>

                <PhotoUpload
                  onUpload={(url) =>
                    setValue('image_url', typeof url === 'string' ? url : '', {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  bucket="photos-produits"
                  folder="categories"
                  label={imageUrl ? "Changer l'image" : "Uploader une image"}
                  aspectRatio="square"
                  size="md"
                  accept="image/jpeg,image/png,image/webp"
                  maxSizeMB={2}
                  defaultImage={imageUrl || undefined}
                />

                <Input
                  variant="glass"
                  label="URL image (optionnelle)"
                  placeholder="https://exemple.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => handleImageUrlChange(e.target.value)}
                  error={errors.image_url?.message}
                />

                <p className="text-xs text-muted-foreground">
                  Vous pouvez uploader une image ou coller directement une URL existante.
                </p>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  SECTION DESCRIPTION / SEO                                   */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Package size={18} className="text-gold-500" />
                    Description
                  </h2>

                  <Badge variant="neutral">
                    {description.trim().length}/{MAX_DESCRIPTION_LENGTH}
                  </Badge>
                </div>

                <textarea
                  {...register('description')}
                  rows={4}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  className="w-full rounded-xl border border-border bg-card p-3 text-sm focus:ring-2 focus:ring-gold-500/50 resize-none transition"
                  placeholder="Une courte description utile pour le SEO et l'affichage public..."
                />

                {errors.description && (
                  <p className="text-red-500 text-xs">{errors.description.message}</p>
                )}
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  SECTION VISIBILITÉ                                          */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-gold-400/20 shadow-soft">
              <CardContent className="p-6 space-y-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Eye size={18} className="text-gold-500" />
                  Visibilité
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between p-4 rounded-xl bg-card border border-border cursor-pointer hover:bg-gold-400/5 transition">
                    <div>
                      <span className="font-medium text-sm">Visible sur le site</span>
                      <p className="text-xs text-muted-foreground">
                        La catégorie apparaîtra dans les menus, la recherche et les pages publiques.
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      {...register('actif')}
                      className="w-5 h-5 text-gold-500 rounded focus:ring-gold-500 border-gray-300"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 rounded-xl bg-card border border-border cursor-pointer hover:bg-gold-400/5 transition">
                    <div>
                      <span className="font-medium text-sm text-gold-600">
                        Afficher sur la page d'accueil
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Apparaîtra dans la section “Catégories populaires”.
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      {...register('afficher_accueil')}
                      className="w-5 h-5 text-gold-500 rounded focus:ring-gold-500 border-gray-300"
                    />
                  </label>
                </div>

                <AnimatePresence initial={false}>
                  {afficherAccueil && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 md:w-1/3">
                        <Input
                          variant="glass"
                          label="Ordre sur la page d'accueil"
                          type="number"
                          placeholder="0"
                          {...register('ordre_accueil', { valueAsNumber: true })}
                          error={errors.ordre_accueil?.message}
                        />

                        <p className="text-xs text-muted-foreground mt-1">
                          Les valeurs plus petites apparaissent en premier.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  OPTIONS AVANCÉES                                            */}
            {/* ============================================================ */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  leftIcon={
                    showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  }
                >
                  <Settings2 size={14} className="mr-2" />
                  Options avancées
                </Button>

                <AnimatePresence initial={false}>
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-border space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
                            <p className="font-medium mb-1">Brouillon automatique</p>
                            <p className="text-muted-foreground">
                              {draftSavedAt
                                ? `Dernier enregistrement : ${draftSavedAt}`
                                : 'Aucun brouillon enregistré pour le moment.'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
                            <p className="font-medium mb-1">Raccourci clavier</p>
                            <p className="text-muted-foreground flex items-center gap-2">
                              <Keyboard size={14} />
                              Ctrl + S ou Cmd + S pour créer.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResetForm}
                            leftIcon={<RotateCcw size={14} />}
                          >
                            Réinitialiser le formulaire
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleDeleteDraft}
                            leftIcon={<Trash2 size={14} />}
                          >
                            Supprimer le brouillon
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/*  FOOTER ACTIONS                                              */}
            {/* ============================================================ */}
            <div className="p-5 border border-border rounded-2xl bg-card shadow-soft flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/admin/categories')}
                disabled={createMutation.isPending}
              >
                Annuler
              </Button>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCreate('continue')}
                  disabled={createMutation.isPending}
                  leftIcon={<Plus size={14} />}
                >
                  Créer et continuer
                </Button>

                <Button
                  type="button"
                  variant="outline-gold"
                  onClick={() => handleCreate('child')}
                  disabled={createMutation.isPending}
                  leftIcon={<FolderTree size={14} />}
                >
                  Créer une sous-catégorie
                </Button>

                <Button
                  type="submit"
                  variant="luxe"
                  loading={createMutation.isPending}
                  leftIcon={<Save size={14} />}
                  className="min-w-[180px]"
                >
                  Créer la catégorie
                </Button>
              </div>
            </div>
          </form>

          {/* -------------------------------------------------------------- */}
          {/*  PANNEAU LATÉRAL / APERÇU                                      */}
          {/* -------------------------------------------------------------- */}
          <aside className="space-y-4 xl:sticky xl:top-6 self-start">
            {/* Aperçu visuel */}
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles size={16} className="text-gold-500" />
                  Aperçu
                </h3>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 border flex items-center justify-center flex-shrink-0">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={24} className="text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {nom.trim() || 'Nouvelle catégorie'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {hierarchyPreview.join(' / ')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{levelLabel(newDepth)}</Badge>

                  {actif ? (
                    <Badge variant="accent" size="sm">
                      <Eye size={12} className="mr-1" />
                      Visible
                    </Badge>
                  ) : (
                    <Badge variant="danger" size="sm">
                      <EyeOff size={12} className="mr-1" />
                      Masquée
                    </Badge>
                  )}

                  {afficherAccueil && (
                    <Badge variant="gold" size="sm">
                      <Home size={12} className="mr-1" />
                      Accueil
                    </Badge>
                  )}

                  {icone && (
                    <Badge variant="neutral" size="sm">
                      {icone}
                    </Badge>
                  )}
                </div>

                {slugPreview && (
                  <div className="rounded-lg border border-border bg-muted/30 p-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono truncate">/{slugPreview}</span>

                    <button
                      type="button"
                      onClick={copySlug}
                      className="p-1 rounded hover:bg-muted transition"
                      title="Copier"
                    >
                      {copiedSlug ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <ClipboardCopy size={14} className="text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Structure */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FolderTree size={16} className="text-gold-500" />
                  Structure
                </h3>

                <ol className="text-xs space-y-1">
                  {ancestorChain.length === 0 && (
                    <li className="text-muted-foreground">
                      Aucune catégorie parente sélectionnée.
                    </li>
                  )}

                  {ancestorChain.map((cat, index) => (
                    <li
                      key={cat.id}
                      className="truncate"
                      style={{ paddingLeft: `${index * 12}px` }}
                    >
                      {'↳ '.repeat(index)}
                      {cat.nom}
                    </li>
                  ))}

                  <li
                    className="font-medium text-gold-600 dark:text-gold-400 truncate"
                    style={{ paddingLeft: `${ancestorChain.length * 12}px` }}
                  >
                    {'↳ '.repeat(ancestorChain.length)}
                    {nom.trim() || 'Nouvelle catégorie'}
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* Checklist */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Check size={16} className="text-gold-500" />
                  Checklist
                </h3>

                <div className="space-y-2">
                  {checklist.map((item) => (
                    <div key={item.label} className="flex items-start gap-2 text-xs">
                      {item.done ? (
                        <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      ) : item.required ? (
                        <AlertCircle
                          size={14}
                          className="text-red-500 mt-0.5 flex-shrink-0"
                        />
                      ) : (
                        <Circle
                          size={14}
                          className="text-muted-foreground mt-0.5 flex-shrink-0"
                        />
                      )}

                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate',
                            item.done ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {item.label}
                        </p>

                        {item.info && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {item.info}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Aide rapide */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-5 space-y-2 text-xs text-muted-foreground">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <HardDrive size={14} className="text-gold-500" />
                  Aide
                </h3>

                <p>
                  Pour une catégorie racine, laissez le parent vide.
                </p>

                <p>
                  Pour une sous-catégorie, sélectionnez la catégorie parente.
                </p>

                <p>
                  Pour l’affichage sur la page d’accueil, cochez “Afficher sur la page d’accueil”.
                  Si votre section populaire n’affiche que les racines, créez une catégorie racine.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </motion.div>
    </Container>
  )
}