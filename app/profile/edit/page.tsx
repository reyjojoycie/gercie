// app/profile/edit/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  Save,
  X,
  Upload,
  Trash2,
  Camera,
  AlertCircle,
  CheckCircle2,
  Loader2,
  WifiOff,
  User,
  Mail,
  Phone,
  MapPin,
  Shield,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2
const MAX_AVATAR_SIZE_MB = 2
const MAX_AVATAR_DIMENSION = 800

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Vérifiez votre réseau et réessayez.',
  timeout: 'La requête prend trop de temps. Réessayez.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne. Vérifiez votre connexion.',
  avatar_too_large: `L'image ne doit pas dépasser ${MAX_AVATAR_SIZE_MB} Mo.`,
  avatar_invalid_type: 'Format invalide. Utilisez JPG, PNG ou WebP.',
  avatar_upload_failed: "Échec de l'upload de l'avatar.",
  save_failed: 'Échec de la sauvegarde. Réessayez.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */
const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/

const profileSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(50),
  prenom: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').max(50),
  email: z.string().email('Email invalide').max(255),
  telephone: z
    .string()
    .regex(PHONE_REGEX, 'Numéro invalide (ex: 0812345678 ou +243812345678)')
    .optional()
    .or(z.literal('')),
  adresse: z.string().max(255).optional().or(z.literal('')),
})

type ProfileForm = z.infer<typeof profileSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function normalizePhone(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '')
  if (cleaned.startsWith('00243')) cleaned = '+243' + cleaned.slice(5)
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) cleaned = '+243' + cleaned.slice(1)
  return cleaned
}

async function compressImage(file: File, maxDimension: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Redimensionner si nécessaire
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension
            width = maxDimension
          } else {
            width = (width / height) * maxDimension
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context failed'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Compression failed'))
          },
          'image/webp',
          0.85
        )
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */
export default function ProfileEditPage() {
  const router = useRouter()
  const { user, refreshRoles } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [initialData, setInitialData] = useState<ProfileForm | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
  })

  // Redirection si non connecté
  useEffect(() => {
    if (!user) {
      router.replace('/login?redirect=/profile/edit')
    }
  }, [user, router])

  // Détection hors-ligne
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setError(ERROR_MESSAGES.offline)
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Chargement des données du profil
  useEffect(() => {
    if (!user) return

    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user/profile', { signal: controller.signal })
        if (cancelled) return

        if (!res.ok) throw new Error('Failed to fetch profile')

        const data = await res.json()
        const profile = data?.data || data

        const formData: ProfileForm = {
          nom: profile.nom || '',
          prenom: profile.prenom || '',
          email: profile.email || user.email || '',
          telephone: profile.telephone || '',
          adresse: profile.adresse || '',
        }

        setInitialData(formData)
        reset(formData)
        setAvatarPreview(profile.avatar_url || null)
      } catch (err: any) {
        if (cancelled) return
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else {
          setError(ERROR_MESSAGES.network)
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setLoading(false)
        }
      }
    }

    fetchProfile()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [user, reset])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Fetch avec retry
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000 * (MAX_RETRIES - retries + 1)))
          return fetchWithRetry(url, options, retries - 1)
        }

        return response
      } catch (err: any) {
        clearTimeout(timeoutId)

        if (retries > 0 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          await new Promise((r) => setTimeout(r, 1000))
          return fetchWithRetry(url, options, retries - 1)
        }

        throw err
      }
    },
    []
  )

  // Gestion sélection avatar
  const handleAvatarSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validation type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(ERROR_MESSAGES.avatar_invalid_type)
      return
    }

    // Validation taille
    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      setError(ERROR_MESSAGES.avatar_too_large)
      return
    }

    setError('')
    setAvatarFile(file)

    // Preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  // Upload avatar
  const uploadAvatar = useCallback(async (): Promise<string | null> => {
    if (!avatarFile) return null

    setUploadingAvatar(true)
    setError('')

    try {
      // Compression
      const compressedBlob = await compressImage(avatarFile, MAX_AVATAR_DIMENSION)

      // Conversion en File
      const compressedFile = new File([compressedBlob], 'avatar.webp', {
        type: 'image/webp',
      })

      // Upload
      const formData = new FormData()
      formData.append('avatar', compressedFile)

      const res = await fetchWithRetry('/api/user/avatar', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(result.error || ERROR_MESSAGES.avatar_upload_failed)
      }

      return result.avatar_url || result.url || null
    } catch (err: any) {
      setError(err.message || ERROR_MESSAGES.avatar_upload_failed)
      return null
    } finally {
      setUploadingAvatar(false)
    }
  }, [avatarFile, fetchWithRetry])

  // Suppression avatar
  const handleRemoveAvatar = useCallback(async () => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    try {
      const res = await fetchWithRetry('/api/user/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove avatar')

      setAvatarPreview(null)
      setAvatarFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      toast.show({
        type: 'success',
        message: 'Avatar supprimé',
        duration: 3000,
      })
    } catch (err: any) {
      setError(err.message || ERROR_MESSAGES.avatar_upload_failed)
    }
  }, [isOnline, fetchWithRetry, toast])

  // Soumission du formulaire
  const onSubmit = useCallback(
    async (data: ProfileForm) => {
      if (!isOnline) {
        setError(ERROR_MESSAGES.offline)
        return
      }

      setSaving(true)
      setError('')
      setSuccess('')

      try {
        // Upload avatar si nouveau
        let avatarUrl = avatarPreview
        if (avatarFile) {
          const uploadedUrl = await uploadAvatar()
          if (!uploadedUrl) {
            setSaving(false)
            return
          }
          avatarUrl = uploadedUrl
        }

        // Préparation des données
        const payload = {
          nom: data.nom.trim(),
          prenom: data.prenom.trim(),
          telephone: data.telephone ? normalizePhone(data.telephone) : null,
          adresse: data.adresse?.trim() || null,
          avatar_url: avatarUrl,
        }

        // Sauvegarde
        const res = await fetchWithRetry('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const result = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (res.status === 409) {
            setError('Cet email ou téléphone est déjà utilisé.')
          } else if (res.status >= 500) {
            setError(ERROR_MESSAGES.server)
          } else {
            setError(result.error || ERROR_MESSAGES.save_failed)
          }
          return
        }

        // Succès
        setSuccess('Profil mis à jour avec succès !')
        await refreshRoles()

        toast.show({
          type: 'success',
          message: 'Profil mis à jour',
          duration: 3000,
        })

        // Redirection après 1.5s
        setTimeout(() => {
          router.push('/profile')
        }, 1500)
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError(ERROR_MESSAGES.timeout)
        } else if (err.name === 'TypeError' || !navigator.onLine) {
          setError(ERROR_MESSAGES.network)
        } else {
          setError(err.message || ERROR_MESSAGES.unknown)
        }
      } finally {
        setSaving(false)
      }
    },
    [isOnline, avatarFile, avatarPreview, uploadAvatar, fetchWithRetry, refreshRoles, router, toast]
  )

  // Annulation
  const handleCancel = useCallback(() => {
    if (initialData) {
      reset(initialData)
    }
    setAvatarPreview(initialData ? (initialData as any).avatar_url : null)
    setAvatarFile(null)
    setError('')
    setSuccess('')
    router.push('/profile')
  }, [initialData, reset, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4" role="status" aria-live="polite">
          <Loader2 size={40} className="animate-spin text-gold-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Chargement du profil...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
            aria-label="Retour au profil"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Retour</span>
          </Link>
        </div>

        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <User size={32} className="text-gold-500" aria-hidden="true" />
            <div>
              <h1 className="text-3xl font-bold text-foreground font-serif">
                Modifier le profil
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Mettez à jour vos informations personnelles
              </p>
            </div>
          </div>

          {/* Alerte hors-ligne */}
          {!isOnline && (
            <div
              role="alert"
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <WifiOff size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">Mode hors ligne</p>
                <p className="text-xs mt-1 opacity-80">
                  Vous ne pouvez pas sauvegarder les modifications sans connexion.
                </p>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              role="status"
              aria-live="polite"
              className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 p-4 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
            >
              <CheckCircle2 size={18} className="flex-shrink-0" aria-hidden="true" />
              <span>{success}</span>
            </div>
          )}

          {/* Formulaire */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-xl">Informations personnelles</CardTitle>
              <CardDescription>
                Ces informations seront visibles sur votre profil public
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
                {/* Avatar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-border">
                  <div className="relative">
                    <div className="h-24 w-24 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 border-2 border-border flex items-center justify-center">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User size={40} className="text-neutral-400" aria-hidden="true" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-gold-500 hover:bg-gold-600 text-white flex items-center justify-center shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2"
                      aria-label="Changer l'avatar"
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Camera size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarSelect}
                      className="hidden"
                      aria-label="Sélectionner une image"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      <Upload size={14} className="mr-2" aria-hidden="true" />
                      {avatarPreview ? 'Changer' : 'Ajouter'} une photo
                    </Button>
                    {avatarPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveAvatar}
                        disabled={uploadingAvatar}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        <Trash2 size={14} className="mr-2" aria-hidden="true" />
                        Supprimer
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG ou WebP. Max {MAX_AVATAR_SIZE_MB} Mo.
                    </p>
                  </div>
                </div>

                {/* Champs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Nom"
                    {...register('nom')}
                    error={errors.nom?.message}
                    placeholder="Votre nom"
                    autoComplete="family-name"
                    autoCapitalize="words"
                    leftIcon={<User size={16} className="text-neutral-400" aria-hidden="true" />}
                    aria-describedby={errors.nom ? 'nom-error' : undefined}
                  />
                  <Input
                    label="Prénom"
                    {...register('prenom')}
                    error={errors.prenom?.message}
                    placeholder="Votre prénom"
                    autoComplete="given-name"
                    autoCapitalize="words"
                    leftIcon={<User size={16} className="text-neutral-400" aria-hidden="true" />}
                    aria-describedby={errors.prenom ? 'prenom-error' : undefined}
                  />
                </div>

                <Input
                  label="Email"
                  type="email"
                  {...register('email')}
                  error={errors.email?.message}
                  placeholder="votre@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  leftIcon={<Mail size={16} className="text-neutral-400" aria-hidden="true" />}
                  aria-describedby={errors.email ? 'email-error' : 'email-note'}
                  disabled
                />
                <p id="email-note" className="text-xs text-muted-foreground -mt-4">
                  <Shield size={12} className="inline mr-1" aria-hidden="true" />
                  L'email ne peut pas être modifié. Contactez le support si nécessaire.
                </p>

                <Input
                  label="Téléphone"
                  type="tel"
                  {...register('telephone')}
                  error={errors.telephone?.message}
                  placeholder="0812345678"
                  autoComplete="tel"
                  leftIcon={<Phone size={16} className="text-neutral-400" aria-hidden="true" />}
                  aria-describedby={errors.telephone ? 'telephone-error' : 'telephone-hint'}
                />
                {!errors.telephone && (
                  <p id="telephone-hint" className="text-xs text-muted-foreground -mt-4">
                    Formats acceptés : 081..., 097..., +243...
                  </p>
                )}

                <Input
                  label="Adresse"
                  {...register('adresse')}
                  error={errors.adresse?.message}
                  placeholder="Votre adresse (optionnel)"
                  autoComplete="street-address"
                  leftIcon={<MapPin size={16} className="text-neutral-400" aria-hidden="true" />}
                />

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
                  <Button
                    type="submit"
                    variant="luxe"
                    size="lg"
                    loading={saving || uploadingAvatar}
                    disabled={saving || uploadingAvatar || !isOnline || !isDirty}
                    className="flex-1 sm:flex-none shadow-gold hover:shadow-glow-gold"
                    aria-busy={saving}
                  >
                    {saving || uploadingAvatar ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                        {uploadingAvatar ? 'Upload...' : 'Sauvegarde...'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Save size={18} aria-hidden="true" />
                        Sauvegarder
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleCancel}
                    disabled={saving || uploadingAvatar}
                    className="flex-1 sm:flex-none"
                  >
                    <X size={18} className="mr-2" aria-hidden="true" />
                    Annuler
                  </Button>
                </div>

                {!isDirty && !avatarFile && (
                  <p className="text-xs text-center text-muted-foreground">
                    Aucune modification à sauvegarder
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Section sécurité */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Shield size={20} className="text-gold-500" aria-hidden="true" />
                Sécurité
              </CardTitle>
              <CardDescription>
                Gérez votre mot de passe et vos options de sécurité
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="/profile/security"
                className="block p-4 rounded-xl border border-border hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Changer le mot de passe</p>
                    <p className="text-sm text-muted-foreground">
                      Modifiez votre mot de passe de connexion
                    </p>
                  </div>
                  <ArrowLeft size={16} className="rotate-180 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
              <Link
                href="/auth/verify-email"
                className="block p-4 rounded-xl border border-border hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Vérifier l'email</p>
                    <p className="text-sm text-muted-foreground">
                      Confirmez votre adresse email
                    </p>
                  </div>
                  <ArrowLeft size={16} className="rotate-180 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
              <Link
                href="/auth/verify-phone"
                className="block p-4 rounded-xl border border-border hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Vérifier le téléphone</p>
                    <p className="text-sm text-muted-foreground">
                      Confirmez votre numéro de téléphone
                    </p>
                  </div>
                  <ArrowLeft size={16} className="rotate-180 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </Container>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-down {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}