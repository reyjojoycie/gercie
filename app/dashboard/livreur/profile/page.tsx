// app/dashboard/livreur/profile/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertCircle,
  Bike,
  Camera,
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Star,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  User,
  X,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface LivreurProfile {
  id: string
  nom: string
  prenom: string
  email: string
  telephone: string | null
  avatar_url: string | null
  est_actif: boolean
  est_disponible: boolean
  total_livraisons: number
  evaluation_moyenne: number
  distance_parcourue_km: number
  zone_operation_principale: string | null
  photo_url: string | null
  moto_modele: string | null
  moto_plaque: string | null
  derniere_activite: string | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const PHONE_REGEX = /^(?:\+243|0)[0-9]{9}$/

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

/**
 * Buckets essayés dans l'ordre pour l'upload de la photo du livreur.
 *
 * Si ton projet utilise un bucket spécifique, tu peux garder seulement celui-là.
 * Exemple :
 * const STORAGE_BUCKETS = ['avatars-livreurs']
 */
const STORAGE_BUCKETS = [
  'avatars-livreurs',
  'livreur-avatars',
  'avatars',
  'photos-produits',
]

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'actif', 'active', 'oui', 'yes', 'on'].includes(str)) return true
  if (['false', 'inactif', 'inactive', 'non', 'no', 'off'].includes(str)) {
    return false
  }

  return fallback
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function formatInt(value: number | null | undefined): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('fr-FR')
}

function formatDecimal(
  value: number | null | undefined,
  digits = 1
): string {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'

  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(value)
  }
}

function formatRelative(value?: string | null): string {
  if (!value) return '—'

  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 30) return `il y a ${days} j`

    return formatDate(value)
  } catch {
    return '—'
  }
}

function getInitials(prenom?: string | null, nom?: string | null): string {
  const first = String(prenom || '').trim().charAt(0)
  const last = String(nom || '').trim().charAt(0)

  return `${first}${last}`.toUpperCase() || 'L'
}

function sanitizeFileName(name: string): string {
  return (
    String(name || 'photo')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'photo'
  )
}

function isBucketMissingError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.statusCode === 404 ||
    message.includes('bucket') ||
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('n’existe pas') ||
    message.includes("n'existe pas")
  )
}

function normalizeProfile(raw: any): LivreurProfile {
  const src = raw?.data ?? raw?.profile ?? raw ?? {}

  const photoUrl = textOrNull(src.photo_url ?? src.avatar_url)

  return {
    id: String(src.id || src.user_id || src.uuid || ''),
    nom: String(src.nom || src.last_name || '').trim(),
    prenom: String(src.prenom || src.first_name || '').trim(),
    email: String(src.email || '').trim(),
    telephone: textOrNull(src.telephone ?? src.phone),
    avatar_url: photoUrl,
    est_actif: toBool(src.est_actif ?? src.active ?? src.is_active, true),
    est_disponible: toBool(
      src.est_disponible ?? src.available ?? src.is_online ?? src.disponible,
      false
    ),
    total_livraisons: toNum(
      src.total_livraisons ?? src.livraisons ?? src.deliveries ?? src.delivery_count
    ),
    evaluation_moyenne: toNum(
      src.evaluation_moyenne ?? src.note_moyenne ?? src.rating ?? src.average_rating
    ),
    distance_parcourue_km: toNum(
      src.distance_parcourue_km ?? src.distance_km ?? src.km ?? src.distance
    ),
    zone_operation_principale: textOrNull(
      src.zone_operation_principale ?? src.zone ?? src.main_zone ?? src.commune
    ),
    photo_url: photoUrl,
    moto_modele: textOrNull(
      src.moto_modele ?? src.motorcycle_model ?? src.vehicle_model
    ),
    moto_plaque: textOrNull(src.moto_plaque ?? src.license_plate ?? src.plate),
    derniere_activite: textOrNull(
      src.derniere_activite ?? src.last_activity ?? src.last_seen ?? src.updated_at
    ),
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const profileSchema = z.object({
  telephone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, 'Format invalide : 0812345678 ou +243812345678')
    .or(z.literal(''))
    .optional()
    .transform((value) => value || null),

  est_disponible: z.boolean(),

  zone_operation_principale: z
    .string()
    .trim()
    .max(120, 'Zone trop longue')
    .optional()
    .transform((value) => value || null),

  moto_modele: z
    .string()
    .trim()
    .max(100, 'Modèle trop long')
    .optional()
    .transform((value) => value || null),

  moto_plaque: z
    .string()
    .trim()
    .max(40, 'Plaque trop longue')
    .optional()
    .transform((value) => value || null),

  photo_url: z
    .string()
    .trim()
    .url('URL photo invalide')
    .or(z.literal(''))
    .optional()
    .transform((value) => value || null),
})

type ProfileFormInput = z.input<typeof profileSchema>
type ProfileFormOutput = z.output<typeof profileSchema>

const DEFAULT_FORM_VALUES: ProfileFormInput = {
  telephone: '',
  est_disponible: true,
  zone_operation_principale: '',
  moto_modele: '',
  moto_plaque: '',
  photo_url: '',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function LivreurProfilePage() {
  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const queryClient = useQueryClient()
  const toast = useToast()

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

  /* ---------------------------------------------------------- */
  /* Titre de page                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Mon profil livreur | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Query profil                                                */
  /* ---------------------------------------------------------- */

  const profileQuery = useQuery<LivreurProfile>({
    queryKey: ['livreur-profile', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/profile', {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de charger le profil.'
        )
      }

      return normalizeProfile(json)
    },
    enabled: Boolean(user && !authLoading),
    staleTime: 30_000,
    retry: 1,
  })

  const profile = profileQuery.data

  /* ---------------------------------------------------------- */
  /* Mutation mise à jour                                        */
  /* ---------------------------------------------------------- */

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ProfileFormOutput>) => {
      const res = await fetch('/api/livreur/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.error || json?.message || 'Impossible de mettre à jour le profil.'
        )
      }

      return normalizeProfile(json)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['livreur-profile'] })

      const keys = Object.keys(variables || {})

      if (keys.length === 1 && keys[0] === 'photo_url') {
        notify(toast, 'success', 'Photo mise à jour.')
        return
      }

      if (keys.length === 1 && keys[0] === 'est_disponible') {
        notify(toast, 'success', 'Disponibilité mise à jour.')
        return
      }

      notify(toast, 'success', 'Profil mis à jour avec succès.')
    },
    onError: (err: any) => {
      notify(
        toast,
        'error',
        err?.message || 'Erreur lors de la mise à jour du profil.'
      )
    },
  })

  /* ---------------------------------------------------------- */
  /* Form                                                        */
  /* ---------------------------------------------------------- */

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormInput>({
    resolver: zodResolver(profileSchema) as any,
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onBlur',
  })

  const profileId = profile?.id

  useEffect(() => {
    if (!profile) return

    reset({
      telephone: profile.telephone || '',
      est_disponible: profile.est_disponible ?? true,
      zone_operation_principale: profile.zone_operation_principale || '',
      moto_modele: profile.moto_modele || '',
      moto_plaque: profile.moto_plaque || '',
      photo_url: profile.photo_url || '',
    })

    setPhotoError('')

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const photoUrl = watch('photo_url') || ''
  const isAvailable = watch('est_disponible') ?? false

  /* ---------------------------------------------------------- */
  /* Derived UI data                                             */
  /* ---------------------------------------------------------- */

  const initials = useMemo(
    () => getInitials(profile?.prenom, profile?.nom),
    [profile?.nom, profile?.prenom]
  )

  const statsItems = useMemo(() => {
    if (!profile) return []

    return [
      {
        label: 'Livraisons',
        value: formatInt(profile.total_livraisons),
        icon: <TrendingUp size={16} />,
      },
      {
        label: 'Évaluation',
        value: `${formatDecimal(profile.evaluation_moyenne, 1)} / 5`,
        icon: <Star size={16} className="text-amber-500" />,
      },
      {
        label: 'Distance',
        value: `${formatDecimal(profile.distance_parcourue_km, 0)} km`,
        icon: <MapPin size={16} />,
      },
      {
        label: 'Dernière activité',
        value: formatRelative(profile.derniere_activite),
        icon: <Clock size={16} />,
      },
    ]
  }, [profile])

  const isBusy =
    profileQuery.isFetching || updateMutation.isPending || uploadingPhoto

  /* ---------------------------------------------------------- */
  /* Upload photo                                                */
  /* ---------------------------------------------------------- */

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setPhotoError('')

      if (!file.type.startsWith('image/')) {
        setPhotoError('Format image requis.')
        notify(toast, 'error', 'Format image requis.')
        return
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setPhotoError('Taille maximale : 2 Mo.')
        notify(toast, 'error', 'Taille maximale : 2 Mo.')
        return
      }

      const extension = file.name.includes('.')
        ? file.name.split('.').pop()?.toLowerCase()
        : ''

      if (!extension || !ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
        setPhotoError('Formats acceptés : JPG, PNG, WEBP.')
        notify(toast, 'error', 'Formats acceptés : JPG, PNG, WEBP.')
        return
      }

      setUploadingPhoto(true)

      let uploadedPath = ''
      let selectedBucket = ''
      let lastError: any = null

      try {
        const safeName = sanitizeFileName(file.name)
        const userId = user?.id || 'anonymous'

        for (const bucket of STORAGE_BUCKETS) {
          const path = `livreurs/${userId}/${Date.now()}-${safeName}`

          const { error: uploadError } = await supabaseBrowser.storage
            .from(bucket)
            .upload(path, file, {
              cacheControl: '3600',
              contentType: file.type,
              upsert: false,
            })

          if (!uploadError) {
            uploadedPath = path
            selectedBucket = bucket
            break
          }

          lastError = uploadError

          if (!isBucketMissingError(uploadError)) {
            break
          }
        }

        if (!uploadedPath || !selectedBucket) {
          throw lastError || new Error('Impossible de téléverser la photo.')
        }

        const { data: publicData } = supabaseBrowser.storage
          .from(selectedBucket)
          .getPublicUrl(uploadedPath)

        const publicUrl = publicData?.publicUrl

        if (!publicUrl) {
          throw new Error('URL publique indisponible.')
        }

        await updateMutation.mutateAsync({
          photo_url: publicUrl,
        })

        setValue('photo_url', publicUrl, { shouldDirty: false })
      } catch (err: any) {
        const message =
          err?.message || 'Erreur lors du téléversement de la photo.'

        setPhotoError(message)
        notify(toast, 'error', message)
      } finally {
        setUploadingPhoto(false)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [setValue, toast, updateMutation, user?.id]
  )

  const handleRemovePhoto = useCallback(async () => {
    try {
      await updateMutation.mutateAsync({
        photo_url: null,
      })

      setValue('photo_url', '', { shouldDirty: false })
      setPhotoError('')
    } catch {
      // onError du mutation affiche déjà le toast
    }
  }, [setValue, updateMutation])

  /* ---------------------------------------------------------- */
  /* Submit                                                      */
  /* ---------------------------------------------------------- */

  const onSubmit = useCallback(
    (values: ProfileFormInput) => {
      const parsed = profileSchema.safeParse(values)

      if (!parsed.success) {
        notify(toast, 'error', 'Données invalides.')
        return
      }

      updateMutation.mutate(parsed.data)
    },
    [toast, updateMutation]
  )

  const handleCancel = useCallback(() => {
    if (!profile) return

    reset({
      telephone: profile.telephone || '',
      est_disponible: profile.est_disponible ?? true,
      zone_operation_principale: profile.zone_operation_principale || '',
      moto_modele: profile.moto_modele || '',
      moto_plaque: profile.moto_plaque || '',
      photo_url: profile.photo_url || '',
    })

    setPhotoError('')
  }, [profile, reset])

  const handleToggleAvailability = useCallback(() => {
    setValue('est_disponible', !isAvailable, { shouldDirty: true })
  }, [isAvailable, setValue])

  /* ---------------------------------------------------------- */
  /* Render guards                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="xl" variant="premium" label="Chargement..." />
          <p className="text-sm text-muted-foreground">
            Vérification de la session...
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card className="w-full max-w-md border-border bg-card/70">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <User size={40} className="text-muted-foreground" />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Connexion requise
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu dois être connecté pour accéder à ton profil livreur.
              </p>
            </div>
            <Link href="/login">
              <Button variant="luxe">Se connecter</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (profileQuery.isLoading && !profile) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
        <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
          <Container className="flex items-center gap-4 py-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40 rounded" />
              <Skeleton className="h-4 w-56 rounded" />
            </div>
          </Container>
        </div>

        <Container className="relative z-10 max-w-4xl py-8">
          <div className="grid gap-8 md:grid-cols-3">
            <Skeleton className="h-[420px] rounded-3xl md:col-span-1" />
            <Skeleton className="h-[520px] rounded-3xl md:col-span-2" />
          </div>
        </Container>
      </div>
    )
  }

  if (profileQuery.isError && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card className="w-full max-w-md border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertCircle size={40} className="text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-red-700 dark:text-red-300">
                Impossible de charger le profil
              </h1>
              <p className="mt-2 text-sm text-red-700/80 dark:text-red-300/80">
                {profileQuery.error instanceof Error
                  ? profileQuery.error.message
                  : 'Erreur inconnue.'}
              </p>
            </div>
            <Button
              variant="outline-gold"
              onClick={() => profileQuery.refetch()}
              leftIcon={<RefreshCw size={14} />}
            >
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) return null

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex flex-wrap items-center gap-4 py-4">
          <Link
            href="/dashboard/livreur"
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour au tableau de bord"
          >
            <ChevronLeft size={20} />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Mon profil
            </h1>
            <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              Gérez vos informations de livraison et votre disponibilité.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={profile.est_actif ? 'gold' : 'danger'} size="sm">
              {profile.est_actif ? 'Compte actif' : 'Compte inactif'}
            </Badge>

            <Badge
              variant={profile.est_disponible ? 'accent' : 'neutral'}
              size="sm"
            >
              {profile.est_disponible ? 'Disponible' : 'Indisponible'}
            </Badge>

            {profileQuery.isFetching && (
              <Badge variant="neutral" size="sm">
                <RefreshCw size={12} className="mr-1 animate-spin" />
                Synchronisation
              </Badge>
            )}
          </div>
        </Container>
      </div>

      <Container className="relative z-10 max-w-4xl py-8">
        {!profile.est_actif && (
          <Card className="mb-8 border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p>
                Ton compte livreur est actuellement inactif. Contacte
                l’administration Gercie pour réactiver ton profil et reprendre
                tes affectations.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-8 md:grid-cols-3">
          {/* Colonne gauche */}
          <div className="space-y-6 md:col-span-1">
            <Card className="border-gold-400/20 bg-card/70 text-center shadow-gold">
              <CardContent className="flex flex-col items-center gap-4 pt-6">
                <div className="group relative">
                  <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-gold-400/30 bg-neutral-200 dark:bg-neutral-700">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={`Photo de ${profile.prenom} ${profile.nom}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gold-400/10 text-5xl font-bold text-gold-500">
                        {initials}
                      </div>
                    )}

                    {uploadingPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                        <Spinner size="lg" />
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-0 right-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Tooltip content="Changer la photo">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto || isBusy}
                        className="rounded-full bg-white p-2 shadow-md transition hover:bg-gold-400/10 disabled:opacity-50 dark:bg-neutral-800"
                        aria-label="Changer la photo"
                      >
                        <Camera size={16} className="text-gold-500" />
                      </button>
                    </Tooltip>

                    {photoUrl && (
                      <Tooltip content="Supprimer la photo">
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={updateMutation.isPending || isBusy}
                          className="rounded-full bg-white p-2 shadow-md transition hover:bg-red-400/10 disabled:opacity-50 dark:bg-neutral-800"
                          aria-label="Supprimer la photo"
                        >
                          <X size={16} className="text-red-500" />
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {photoError && (
                  <p className="text-xs text-red-500">{photoError}</p>
                )}

                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                    {profile.prenom} {profile.nom}
                  </h2>
                  <p className="text-sm text-gold-600 dark:text-gold-400">
                    {profile.email}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleAvailability}
                  disabled={isBusy}
                  className="mt-2 inline-flex items-center gap-2 disabled:opacity-60"
                  aria-label="Basculer la disponibilité"
                >
                  {isAvailable ? (
                    <ToggleRight size={28} className="text-emerald-500" />
                  ) : (
                    <ToggleLeft size={28} className="text-neutral-400" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isAvailable
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-neutral-500 dark:text-neutral-400'
                    )}
                  >
                    {isAvailable ? 'Disponible' : 'Indisponible'}
                  </span>
                </button>

                <p className="text-xs text-muted-foreground">
                  La disponibilité est enregistrée avec le formulaire.
                </p>
              </CardContent>
            </Card>

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity size={18} className="text-gold-500" />
                  Statistiques
                </CardTitle>
                <CardDescription>
                  Aperçu de ta performance logistique.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                {statsItems.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                      {stat.icon}
                      <span className="truncate">{stat.label}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite */}
          <div className="md:col-span-2">
            <Card className="border-gold-400/20 bg-card/70 shadow-gold">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <User size={18} className="text-gold-500" />
                  Informations personnelles
                </CardTitle>
                <CardDescription>
                  Mets à jour tes coordonnées, ta zone d’opération et tes
                  informations moto.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <Input
                    variant="glass"
                    label="Téléphone"
                    placeholder="0812345678"
                    leftIcon={
                      <Phone size={16} className="text-neutral-400" />
                    }
                    {...register('telephone')}
                    error={errors.telephone?.message}
                    disabled={isBusy}
                  />

                  <Input
                    variant="glass"
                    label="Zone d’opération principale"
                    placeholder="Ex : Gombe, Limete, Ngaliema"
                    leftIcon={
                      <MapPin size={16} className="text-neutral-400" />
                    }
                    {...register('zone_operation_principale')}
                    error={errors.zone_operation_principale?.message}
                    disabled={isBusy}
                  />

                  <Input
                    variant="glass"
                    label="Modèle de moto"
                    placeholder="Ex : Bajaj Boxer"
                    leftIcon={<Bike size={16} className="text-neutral-400" />}
                    {...register('moto_modele')}
                    error={errors.moto_modele?.message}
                    disabled={isBusy}
                  />

                  <Input
                    variant="glass"
                    label="Plaque d’immatriculation"
                    placeholder="Ex : AB123CD"
                    {...register('moto_plaque')}
                    error={errors.moto_plaque?.message}
                    disabled={isBusy}
                  />

                  <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Disponibilité
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Active cette option pour recevoir des affectations.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleAvailability}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 disabled:opacity-60"
                      aria-label="Basculer la disponibilité"
                    >
                      {isAvailable ? (
                        <ToggleRight size={28} className="text-emerald-500" />
                      ) : (
                        <ToggleLeft size={28} className="text-neutral-400" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isAvailable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        )}
                      >
                        {isAvailable ? 'Disponible' : 'Indisponible'}
                      </span>
                    </button>
                  </div>

                  {updateMutation.isError && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
                      <AlertCircle size={16} />
                      {updateMutation.error instanceof Error
                        ? updateMutation.error.message
                        : 'Erreur lors de la mise à jour.'}
                    </div>
                  )}

                  {updateMutation.isSuccess && !updateMutation.isPending && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                      <CheckCircle size={16} />
                      Profil mis à jour avec succès.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      type="submit"
                      variant="luxe"
                      size="lg"
                      loading={isSubmitting || updateMutation.isPending}
                      disabled={!isDirty || isBusy}
                      leftIcon={<Save size={18} />}
                      className="shadow-gold"
                    >
                      Enregistrer les modifications
                    </Button>

                    {isDirty && (
                      <Button
                        type="button"
                        variant="outline-gold"
                        size="lg"
                        onClick={handleCancel}
                        disabled={isBusy}
                        leftIcon={<RefreshCw size={18} />}
                      >
                        Annuler
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="mt-6 border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock size={18} className="text-gold-500" />
                  Activité récente
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Dernière activité
                  </span>
                  <span className="font-medium text-foreground">
                    {formatDateTime(profile.derniere_activite)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Téléphone enregistré
                  </span>
                  <span className="font-medium text-foreground">
                    {profile.telephone || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Zone</span>
                  <span className="font-medium text-foreground">
                    {profile.zone_operation_principale || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Moto</span>
                  <span className="font-medium text-foreground">
                    {profile.moto_modele || '—'}
                    {profile.moto_plaque ? ` · ${profile.moto_plaque}` : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}