// ---------------------------------------------------------------------------
// Étape 2 Onboarding – Profil et adresses
// Optimisé pour mobile 2G/3G : compression image, skeleton, retry, UX premium
// ---------------------------------------------------------------------------
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Phone,
  Camera,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { PHONE_REGEX, normalizePhone } from '@/lib/validators/auth'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import AddressCascadeSelect, { AddressData } from '@/components/AddressCascadeSelect'

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */

const profileSchema = z.object({
  nom: z
    .string()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères'),
  prenom: z
    .string()
    .min(2, 'Le prénom doit comporter au moins 2 caractères')
    .max(50, 'Le prénom ne peut pas dépasser 50 caractères'),
  telephone: z
    .string()
    .regex(PHONE_REGEX, 'Numéro invalide (ex: 0812345678 ou +243812345678)')
    .optional()
    .or(z.literal('')),
})

type ProfileForm = z.infer<typeof profileSchema>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserAddress {
  id: string
  nom: string
  province_id?: string | number
  ville_id?: string | number
  commune_id?: string | number
  quartier?: string
  avenue?: string
  numero?: string
  reference?: string
  adresse_text?: string
  telephone?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers : compression d'image                                      */
/* ------------------------------------------------------------------ */

async function compressImage(file: File, maxSizeMB: number = 0.5): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        const maxWidth = 800
        const maxHeight = 800
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Impossible de créer le contexte canvas'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Échec de compression'))
              return
            }

            const compressedFile = new File([blob], file.name, {
              type: 'image/webp',
              lastModified: Date.now(),
            })

            resolve(compressedFile)
          },
          'image/webp',
          0.8
        )
      }
      img.onerror = () => reject(new Error('Image invalide'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Erreur de lecture'))
    reader.readAsDataURL(file)
  })
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

export default function ProfileStep() {
  const router = useRouter()
  const { user, refreshRoles } = useAuth()

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true)

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Adresses
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState<Partial<UserAddress>>({ nom: '' })
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nom: '', prenom: '', telephone: '' },
  })

  /* ---------------------------------------------------------------- */
  /*  ✅ CORRECTION BOUCLE INFINIE : useCallback pour onAddressChange  */
  /* ---------------------------------------------------------------- */
  
  const handleAddressChange = useCallback((data: AddressData) => {
    setNewAddress((prev) => ({
      ...prev,
      ...data,
    }))
  }, []) // ✅ Tableau de dépendances VIDE = fonction stable

  /* ---------------------------------------------------------------- */
  /*  Chargement du profil                                             */
  /* ---------------------------------------------------------------- */

  const loadProfile = useCallback(async () => {
    if (!user) return

    setIsLoadingProfile(true)
    setError('')

    try {
      const { data, error: profileError } = await supabaseBrowser
        .from('profiles')
        .select('nom, prenom, telephone, avatar_url')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      reset({
        nom: data.nom || user.user_metadata?.nom || '',
        prenom: data.prenom || user.user_metadata?.prenom || '',
        telephone: data.telephone || user.phone || user.user_metadata?.phone || '',
      })
      setAvatarUrl(data.avatar_url || null)
    } catch (err: any) {
      console.error('[ProfileStep] Erreur chargement profil:', err)
      reset({
        nom: user.user_metadata?.nom || '',
        prenom: user.user_metadata?.prenom || '',
        telephone: user.phone || user.user_metadata?.phone || '',
      })
    } finally {
      setIsLoadingProfile(false)
    }
  }, [user, reset])

  /* ---------------------------------------------------------------- */
  /*  Chargement des adresses                                          */
  /* ---------------------------------------------------------------- */

  const loadAddresses = useCallback(async () => {
    if (!user) return

    setIsLoadingAddresses(true)
    setError('')

    try {
      const res = await fetch('/api/user/addresses', {
        headers: { 'Accept': 'application/json' },
      })

      if (!res.ok) {
        throw new Error('Impossible de charger les adresses')
      }

      const result = await res.json()
      const list = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
        ? result.data
        : []

      setAddresses(list)
    } catch (err: any) {
      console.error('[ProfileStep] Erreur chargement adresses:', err)
      setError('Impossible de charger vos adresses. Vérifiez votre connexion.')
    } finally {
      setIsLoadingAddresses(false)
    }
  }, [user])

  useEffect(() => {
    loadProfile()
    loadAddresses()
  }, [loadProfile, loadAddresses])

  /* ---------------------------------------------------------------- */
  /*  Upload avatar avec compression                                   */
  /* ---------------------------------------------------------------- */

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (file.size > 5 * 1024 * 1024) {
      setError("L'image ne doit pas dépasser 5 Mo.")
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format invalide. Utilisez JPG, PNG ou WebP.')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingAvatar(true)
    setError('')

    try {
      const compressedFile = await compressImage(file, 0.5)

      const fileExt = compressedFile.name.split('.').pop()
      const fileName = `${user.id}/avatar.${fileExt}`

      if (avatarUrl) {
        try {
          const oldPath = avatarUrl.split('/').slice(-2).join('/')
          await supabaseBrowser.storage.from('avatars').remove([oldPath])
        } catch {
          // Non bloquant
        }
      }

      const { error: uploadError } = await supabaseBrowser.storage
        .from('avatars')
        .upload(fileName, compressedFile, { upsert: true })

      if (uploadError) throw uploadError

      const { data: publicUrl } = supabaseBrowser.storage
        .from('avatars')
        .getPublicUrl(fileName)

      setAvatarUrl(publicUrl.publicUrl)
      setAvatarPreview(null)

      await supabaseBrowser
        .from('profiles')
        .update({ avatar_url: publicUrl.publicUrl })
        .eq('id', user.id)

      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      console.error('[ProfileStep] Erreur upload avatar:', err)
      setError(err.message || "Erreur lors de l'upload de la photo.")
      setAvatarPreview(null)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Soumission du profil                                             */
  /* ---------------------------------------------------------------- */

  const onSubmit = async (data: ProfileForm) => {
    setError('')
    setSuccess('')

    try {
      const payload = {
        nom: data.nom.trim(),
        prenom: data.prenom.trim(),
        telephone: data.telephone ? normalizePhone(data.telephone) : undefined,
        avatar_url: avatarUrl,
      }

      const res = await fetch('/api/user/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur lors de la sauvegarde')
      }

      setSuccess('Profil enregistré avec succès')

      if (refreshRoles) await refreshRoles()

      setTimeout(() => {
        router.push('/onboarding/preferences')
      }, 1000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  ✅ CORRECTION : Gestion des adresses avec validation alignée     */
  /* ---------------------------------------------------------------- */

  const handleSaveAddress = async () => {
    // ✅ Validation alignée avec le serveur (addressSchema)
    const nomTrimmed = (newAddress.nom || '').trim()

    if (!nomTrimmed) {
      setError('Veuillez donner un nom à cette adresse.')
      return
    }

    if (nomTrimmed.length < 2) {
      setError('Le nom de l\'adresse doit comporter au moins 2 caractères.')
      return
    }

    if (nomTrimmed.length > 50) {
      setError('Le nom de l\'adresse ne peut pas dépasser 50 caractères.')
      return
    }

    if (!newAddress.province_id) {
      setError('Veuillez sélectionner une province.')
      return
    }

    if (!newAddress.ville_id) {
      setError('Veuillez sélectionner une ville.')
      return
    }

    if (!newAddress.commune_id) {
      setError('Veuillez sélectionner une commune.')
      return
    }

    if (!newAddress.quartier?.trim() && !newAddress.avenue?.trim()) {
      setError('Veuillez remplir au moins le quartier ou l\'avenue.')
      return
    }

    setSavingAddress(true)
    setError('')

    try {
      const adressePayload = {
        nom: nomTrimmed,
        province_id: String(newAddress.province_id),
        ville_id: String(newAddress.ville_id),
        commune_id: String(newAddress.commune_id),
        quartier: newAddress.quartier?.trim() || null,
        avenue: newAddress.avenue?.trim() || null,
        numero: newAddress.numero?.trim() || null,
        reference: newAddress.reference?.trim() || null,
        telephone: newAddress.telephone?.trim() || null,
      }

      console.log('[ProfileStep] Envoi adresse:', adressePayload)

      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adressePayload),
      })

      const saved = await res.json()

      if (!res.ok) {
        // ✅ Afficher les erreurs détaillées du serveur
        const details = saved.errors
          ? Object.entries(saved.errors)
              .map(([field, msg]) => `${field}: ${msg}`)
              .join(' | ')
          : saved.error || 'Erreur lors de l\'enregistrement'
        throw new Error(details)
      }

      setAddresses((prev) => [...prev, saved.data || saved])
      setShowAddressForm(false)
      setNewAddress({ nom: '' })
      setSuccess('Adresse ajoutée avec succès')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      console.error('[ProfileStep] Erreur sauvegarde adresse:', err)
      setError(err.message)
    } finally {
      setSavingAddress(false)
    }
  }

  const handleDeleteAddress = async (id: string) => {
    if (addressToDelete !== id) {
      setAddressToDelete(id)
      return
    }

    try {
      const res = await fetch(`/api/user/addresses?id=${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error()

      setAddresses(addresses.filter((a) => a.id !== id))
      setAddressToDelete(null)
      setSuccess('Adresse supprimée')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Erreur lors de la suppression de l\'adresse')
      setAddressToDelete(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Skeleton : chargement                                            */
  /* ---------------------------------------------------------------- */

  if (isLoadingProfile || isLoadingAddresses) {
    return (
      <div className="w-full">
        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-24 h-24 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            <div className="h-8 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 mx-auto mb-2 animate-pulse" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2 mx-auto animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse" />
              <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse" />
              <div className="h-12 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse" />
            </div>
            <div className="h-32 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayAvatar = avatarPreview || avatarUrl

  /* ---------------------------------------------------------------- */
  /*  Rendu principal                                                  */
  /* ---------------------------------------------------------------- */

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
              <User size={32} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
            </div>

            <CardTitle className="text-3xl font-serif text-neutral-900 dark:text-neutral-100">
              Complétez votre profil
            </CardTitle>

            <CardDescription className="text-neutral-500 dark:text-neutral-400 mt-2">
              Ajoutez une photo et vos adresses de livraison.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="alert"
                  className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 mb-6 rounded-xl text-sm flex items-center gap-2"
                >
                  <AlertCircle size={16} aria-hidden="true" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Fermer"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Succès */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="status"
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 p-4 mb-6 rounded-xl text-sm flex items-center gap-2"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {success}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Avatar */}
              <div className="flex flex-col items-center">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gold-100 to-amber-100 dark:from-gold-900/30 dark:to-amber-900/20 flex items-center justify-center text-gold-700 dark:text-gold-300 font-bold text-2xl border-2 border-gold-400/30 overflow-hidden">
                    {displayAvatar ? (
                      <img
                        src={displayAvatar}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (user?.user_metadata?.nom?.charAt(0) || user?.email?.charAt(0) || 'G').toUpperCase()
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 bg-gold-500 text-white rounded-full p-2 shadow-md hover:bg-gold-600 transition disabled:opacity-50"
                    aria-label="Changer la photo de profil"
                  >
                    {uploadingAvatar ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera size={16} aria-hidden="true" />
                    )}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    aria-label="Sélectionner une photo de profil"
                  />
                </div>

                <p className="text-xs text-neutral-400 mt-2">
                  Cliquez sur l&apos;appareil photo pour ajouter une photo (optionnel)
                </p>
              </div>

              {/* Champs du profil */}
              <Input
                variant="glass"
                label="Nom *"
                {...register('nom')}
                error={errors.nom?.message}
                placeholder="Votre nom"
                autoComplete="family-name"
                required
              />

              <Input
                variant="glass"
                label="Prénom *"
                {...register('prenom')}
                error={errors.prenom?.message}
                placeholder="Votre prénom"
                autoComplete="given-name"
                required
              />

              <Input
                variant="glass"
                label="Téléphone (optionnel)"
                type="tel"
                {...register('telephone')}
                error={errors.telephone?.message}
                placeholder="0812345678"
                autoComplete="tel"
                leftIcon={<Phone size={16} className="text-neutral-400" aria-hidden="true" />}
              />

              {/* Adresses */}
              <div className="border-t border-gold-400/20 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Adresses de livraison
                  </h3>

                  <Button
                    type="button"
                    variant="outline-gold"
                    size="sm"
                    onClick={() => setShowAddressForm(true)}
                    disabled={showAddressForm}
                  >
                    <Plus size={14} className="mr-1" aria-hidden="true" />
                    Ajouter
                  </Button>
                </div>

                {addresses.length === 0 && !showAddressForm && (
                  <p className="text-sm text-neutral-400 text-center py-4">
                    Aucune adresse enregistrée. Ajoutez-en une pour faciliter vos livraisons.
                  </p>
                )}

                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-3 flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                          {addr.nom}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                          {addr.adresse_text || `${addr.quartier || ''}, ${addr.avenue || ''}`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(addr.id)}
                        className={`p-1 transition ${
                          addressToDelete === addr.id
                            ? 'text-red-600 bg-red-50 dark:bg-red-950/20 rounded'
                            : 'text-red-400 hover:text-red-500'
                        }`}
                        aria-label={
                          addressToDelete === addr.id
                            ? `Confirmer la suppression de ${addr.nom}`
                            : `Supprimer l'adresse ${addr.nom}`
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {showAddressForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-4 border-t border-gold-400/20 pt-4"
                    >
                      <div className="space-y-4">
                        <div>
                          <Input
                            label="Libellé de l'adresse *"
                            placeholder="Ex: Maison, Travail... (min. 2 caractères)"
                            value={newAddress.nom || ''}
                            onChange={(e) => setNewAddress({ ...newAddress, nom: e.target.value })}
                            variant="glass"
                            required
                            maxLength={50}
                          />
                          <div className="flex justify-between mt-1 px-1">
                            <span className="text-xs text-neutral-400">
                              {(newAddress.nom || '').trim().length < 2
                                ? 'Minimum 2 caractères'
                                : '✓ OK'}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {(newAddress.nom || '').length}/50
                            </span>
                          </div>
                        </div>

                        {/* ✅ CORRECTION : on utilise handleAddressChange (useCallback) */}
                        <AddressCascadeSelect
                          onAddressChange={handleAddressChange}
                          initialData={newAddress}
                        />

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="luxe"
                            size="sm"
                            onClick={handleSaveAddress}
                            loading={savingAddress}
                          >
                            Enregistrer l&apos;adresse
                          </Button>

                          <Button
                            type="button"
                            variant="outline-gold"
                            size="sm"
                            onClick={() => {
                              setShowAddressForm(false)
                              setNewAddress({ nom: '' })
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push('/onboarding')}
                  className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  <ArrowLeft size={16} className="mr-1" aria-hidden="true" />
                  Retour
                </Button>

                <Button
                  type="submit"
                  variant="luxe"
                  size="lg"
                  loading={isSubmitting}
                  className="shadow-gold hover:shadow-glow-gold"
                >
                  {isSubmitting ? 'Enregistrement…' : 'Continuer'}
                  <ArrowRight size={16} className="ml-1" aria-hidden="true" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}