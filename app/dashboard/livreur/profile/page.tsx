// app/dashboard/livreur/profile/page.tsx
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { toast } from '@/components/ui/Toast'
import {
  ArrowLeft, User, Phone, MapPin, Bike, Save, AlertCircle, CheckCircle,
  ToggleLeft, ToggleRight, Sparkles, Camera, X, Upload, RefreshCw, Star,
  Activity, TrendingUp, Award, Clock, ChevronLeft, ShieldCheck
} from 'lucide-react'

import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types (conservés)                                                  */
/* ------------------------------------------------------------------ */
interface LivreurProfile {
  id: string
  nom: string
  prenom: string
  email: string
  telephone: string
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

/* ------------------------------------------------------------------ */
/*  Schéma Zod (enrichi – photo_url facultatif)                        */
/* ------------------------------------------------------------------ */
const profileSchema = z.object({
  telephone: z
    .string()
    .regex(/^0[0-9]{9}$/, 'Format : 0812345678')
    .or(z.literal('')),
  est_disponible: z.boolean(),
  zone_operation_principale: z.string().max(100).optional(),
  moto_modele: z.string().max(50).optional(),
  moto_plaque: z.string().max(20).optional(),
  photo_url: z.string().url().nullable().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */
export default function LivreurProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  /* ---------- États locaux ---------- */
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ---------- React Query : profil ---------- */
  const {
    data: profile,
    isLoading: profileLoading,
    isError,
    error: profileError,
    refetch,
  } = useQuery<LivreurProfile>({
    queryKey: ['livreur-profile', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/livreur/profile')
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    enabled: !!user && !authLoading,
    staleTime: 30_000,
  })

  /* ---------- Mutation mise à jour ---------- */
  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const res = await fetch('/api/livreur/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['livreur-profile'] })
      toast.addToast({ type: 'success', message: 'Profil mis à jour' })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  /* ---------- React Hook Form ---------- */
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      telephone: '',
      est_disponible: true,
      zone_operation_principale: '',
      moto_modele: '',
      moto_plaque: '',
      photo_url: null,
    },
  })

  // Synchroniser avec les données du serveur
  useEffect(() => {
    if (profile) {
      reset({
        telephone: profile.telephone || '',
        est_disponible: profile.est_disponible ?? true,
        zone_operation_principale: profile.zone_operation_principale || '',
        moto_modele: profile.moto_modele || '',
        moto_plaque: profile.moto_plaque || '',
        photo_url: profile.photo_url,
      })
    }
  }, [profile, reset])

  const photoUrl = watch('photo_url')

  /* ---------- Upload photo ---------- */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Format image requis')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Taille max 2 Mo')
      return
    }
    setUploadingPhoto(true)
    setPhotoError('')
    try {
      const path = `livreurs/${user?.id}_${Date.now()}.${file.name.split('.').pop()}`
      const { error: uploadError } = await supabaseBrowser.storage.from('photos-produits').upload(path, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabaseBrowser.storage.from('photos-produits').getPublicUrl(path)
      setValue('photo_url', publicUrl, { shouldDirty: true })
      // Sauvegarde immédiate
      await updateMutation.mutateAsync({ ...watch(), photo_url: publicUrl })
    } catch (err: any) {
      setPhotoError(err.message)
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    setValue('photo_url', null, { shouldDirty: true })
    // Sauvegarde
    await updateMutation.mutateAsync({ ...watch(), photo_url: null })
  }

  const onSubmit = (data: ProfileForm) => {
    updateMutation.mutate(data)
  }

  /* ---------- États de chargement ---------- */
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center">
        <Spinner size="xl" variant="premium" label="Chargement du profil..." />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center max-w-md">
          <CardContent className="py-12">
            <User size={48} className="mx-auto text-neutral-400 mb-4" />
            <p className="text-neutral-500">Impossible de charger le profil.</p>
            <Button variant="outline-gold" onClick={() => refetch()} className="mt-4" leftIcon={<RefreshCw size={14} />}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isBusy = isSubmitting || updateMutation.isPending || uploadingPhoto

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-5 dark:opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/70 dark:bg-midnight-900/70 border-b border-gold-400/20 shadow-soft">
        <Container className="py-4 flex items-center gap-4">
          <Link
            href="/dashboard/livreur"
            className="p-2 rounded-xl hover:bg-gold-400/10 text-neutral-400 hover:text-gold-500 transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">Mon profil</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Gérez vos informations personnelles
            </p>
          </div>
        </Container>
      </div>

      <Container className="py-8 max-w-4xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Colonne gauche : photo + stats */}
            <div className="md:col-span-1 space-y-6">
              {/* Photo */}
              <Card variant="glass" className="border-gold-400/20 shadow-gold text-center">
                <CardContent className="pt-6 flex flex-col items-center gap-4">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gold-400/30 bg-neutral-200 dark:bg-neutral-700">
                      {photoUrl ? (
                        <Image src={photoUrl} alt="Photo" fill className="object-cover" sizes="128px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-gold-500 bg-gold-400/10">
                          {(profile.prenom?.[0] || 'L').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip content="Télécharger une photo">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingPhoto}
                          className="p-2 rounded-full bg-white dark:bg-neutral-800 shadow-md hover:bg-gold-400/10 transition"
                        >
                          <Camera size={16} className="text-gold-500" />
                        </button>
                      </Tooltip>
                      {photoUrl && (
                        <Tooltip content="Supprimer la photo">
                          <button
                            onClick={handleRemovePhoto}
                            disabled={updateMutation.isPending}
                            className="p-2 rounded-full bg-white dark:bg-neutral-800 shadow-md hover:bg-red-400/10 transition"
                          >
                            <X size={16} className="text-red-500" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {photoError && (
                      <p className="text-xs text-red-500 mt-1">{photoError}</p>
                    )}
                    {uploadingPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                        <Spinner size="lg" variant="gold" />
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                      {profile.prenom} {profile.nom}
                    </h2>
                    <p className="text-sm text-gold-600 dark:text-gold-400">{profile.email}</p>
                  </div>

                  {/* Disponibilité rapide */}
                  <button
                    type="button"
                    onClick={() => setValue('est_disponible', !watch('est_disponible'), { shouldDirty: true })}
                    className="flex items-center gap-2 mt-2"
                  >
                    {watch('est_disponible') ? (
                      <ToggleRight size={28} className="text-green-400" />
                    ) : (
                      <ToggleLeft size={28} className="text-neutral-400" />
                    )}
                    <span className={cn('text-sm font-medium', watch('est_disponible') ? 'text-green-400' : 'text-neutral-500')}>
                      {watch('est_disponible') ? 'Disponible' : 'Indisponible'}
                    </span>
                  </button>
                </CardContent>
              </Card>

              {/* Statistiques */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity size={18} className="text-gold-500" /> Statistiques
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { label: 'Livraisons', value: profile.total_livraisons, icon: <TrendingUp size={16} /> },
                    { label: 'Évaluation', value: `${profile.evaluation_moyenne.toFixed(1)} / 5`, icon: <Star size={16} className="text-amber-500" /> },
                    { label: 'Distance', value: `${profile.distance_parcourue_km.toFixed(0)} km`, icon: <MapPin size={16} /> },
                    { label: 'Dernière activité', value: profile.derniere_activite ? new Date(profile.derniere_activite).toLocaleString() : '—', icon: <Clock size={16} /> },
                  ].map((stat, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-neutral-500 flex items-center gap-2">{stat.icon}{stat.label}</span>
                      <span className="font-semibold">{stat.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Colonne droite : formulaire */}
            <div className="md:col-span-2">
              <Card variant="glass" className="border-gold-400/20 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                    <User size={18} className="text-gold-500" />
                    Informations personnelles
                  </CardTitle>
                  <CardDescription>Complétez vos coordonnées et votre statut</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <Input
                      variant="glass"
                      label="Téléphone"
                      leftIcon={<Phone size={16} className="text-neutral-400" />}
                      {...register('telephone')}
                      error={errors.telephone?.message}
                      placeholder="0812345678"
                    />

                    <Input
                      variant="glass"
                      label="Zone d'opération principale"
                      leftIcon={<MapPin size={16} className="text-neutral-400" />}
                      {...register('zone_operation_principale')}
                      placeholder="Ex: Kinshasa, Gombe"
                    />

                    <Input
                      variant="glass"
                      label="Modèle de moto"
                      leftIcon={<Bike size={16} className="text-neutral-400" />}
                      {...register('moto_modele')}
                      placeholder="Ex: Bajaj Boxer"
                    />

                    <Input
                      variant="glass"
                      label="Plaque d'immatriculation"
                      {...register('moto_plaque')}
                      placeholder="Ex: AB123CD"
                    />

                    {/* Disponibilité */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Disponibilité</span>
                      <button
                        type="button"
                        onClick={() => setValue('est_disponible', !watch('est_disponible'), { shouldDirty: true })}
                        className="flex items-center gap-2"
                      >
                        {watch('est_disponible') ? (
                          <ToggleRight size={28} className="text-green-400" />
                        ) : (
                          <ToggleLeft size={28} className="text-neutral-400" />
                        )}
                        <span className={cn(
                          'text-sm font-medium',
                          watch('est_disponible') ? 'text-green-400' : 'text-neutral-500'
                        )}>
                          {watch('est_disponible') ? 'Disponible' : 'Indisponible'}
                        </span>
                      </button>
                    </div>

                    {/* Messages */}
                    {updateMutation.isError && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl text-sm">
                        <AlertCircle size={16} />
                        {(updateMutation.error as Error)?.message || 'Erreur'}
                      </div>
                    )}
                    {updateMutation.isSuccess && (
                      <div className="flex items-center gap-2 text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 p-3 rounded-xl text-sm">
                        <CheckCircle size={16} />
                        Profil mis à jour avec succès
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="submit"
                        variant="luxe"
                        fullWidth
                        size="lg"
                        loading={isSubmitting || updateMutation.isPending}
                        className="shadow-gold"
                        leftIcon={<Save size={18} />}
                        disabled={!isDirty}
                      >
                        Enregistrer les modifications
                      </Button>
                      {isDirty && (
                        <Button
                          variant="outline-gold"
                          size="lg"
                          onClick={() => reset()}
                          disabled={isSubmitting || updateMutation.isPending}
                          leftIcon={<RefreshCw size={18} />}
                        >
                          Annuler
                        </Button>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}