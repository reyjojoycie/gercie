// app/profile/addresses/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Star,
  Phone,
  Home,
  AlertCircle,
  CheckCircle2,
  Loader2,
  WifiOff,
  X,
  Building2,
} from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const FETCH_TIMEOUT = 15000
const MAX_RETRIES = 2

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/* ------------------------------------------------------------------ */
const ERROR_MESSAGES = {
  network: 'Connexion instable. Réessayez dans quelques instants.',
  timeout: 'La requête prend trop de temps.',
  server: 'Service temporairement indisponible.',
  offline: 'Vous êtes hors ligne.',
  load_failed: 'Impossible de charger les adresses.',
  save_failed: "Impossible d'enregistrer l'adresse.",
  delete_failed: 'Impossible de supprimer l\'adresse.',
  unknown: 'Une erreur est survenue.',
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Province {
  id: string
  nom: string
}

interface Ville {
  id: string
  nom: string
  province_id: string
}

interface Commune {
  id: string
  nom: string
  ville_id: string
}

interface UserAddress {
  id: string
  nom: string | null
  province_id: string | null
  ville_id: string | null
  commune_id: string | null
  quartier: string | null
  avenue: string | null
  numero: string | null
  reference: string | null
  telephone: string | null
  adresse_text: string | null
  is_default?: boolean
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Schéma de validation                                               */
/* ------------------------------------------------------------------ */
const PHONE_REGEX = /^(\+?243|00243|0)[1-9][0-9]{7,8}$/

const addressSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  province_id: z.string().min(1, 'Province requise'),
  ville_id: z.string().min(1, 'Ville requise'),
  commune_id: z.string().min(1, 'Commune requise'),
  quartier: z.string().min(2, 'Quartier requis').max(100),
  avenue: z.string().min(2, 'Avenue requise').max(100),
  numero: z.string().max(20).optional().or(z.literal('')),
  reference: z.string().max(200).optional().or(z.literal('')),
  telephone: z
    .string()
    .regex(PHONE_REGEX, 'Numéro invalide (ex: 0812345678)')
    .optional()
    .or(z.literal('')),
})

type AddressForm = z.infer<typeof addressSchema>

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

function formatAddress(address: UserAddress, provinces: Province[], villes: Ville[], communes: Commune[]): string {
  const parts: string[] = []
  
  if (address.avenue) parts.push(address.avenue)
  if (address.numero) parts.push(`N°${address.numero}`)
  if (address.quartier) parts.push(address.quartier)
  
  const commune = communes.find(c => c.id === address.commune_id)
  if (commune) parts.push(commune.nom)
  
  const ville = villes.find(v => v.id === address.ville_id)
  if (ville) parts.push(ville.nom)
  
  const province = provinces.find(p => p.id === address.province_id)
  if (province) parts.push(province.nom)
  
  if (address.reference) parts.push(`(${address.reference})`)
  
  return parts.join(', ') || address.adresse_text || 'Adresse incomplète'
}

/* ------------------------------------------------------------------ */
/*  Composant carte adresse                                            */
/* ------------------------------------------------------------------ */
function AddressCard({
  address,
  provinces,
  villes,
  communes,
  onEdit,
  onDelete,
  onSetDefault,
  isDeleting,
}: {
  address: UserAddress
  provinces: Province[]
  villes: Ville[]
  communes: Commune[]
  onEdit: (address: UserAddress) => void
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
  isDeleting: boolean
}) {
  return (
    <div
      className={cn(
        'p-4 rounded-xl border transition-colors',
        address.is_default
          ? 'border-gold-400 bg-gold-50/50 dark:bg-gold-950/20 dark:border-gold-800'
          : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {address.nom || 'Sans nom'}
            </h3>
            {address.is_default && (
              <Badge variant="gold" size="sm">
                <Star size={12} className="mr-1" aria-hidden="true" />
                Par défaut
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
            {formatAddress(address, provinces, villes, communes)}
          </p>
          
          {address.telephone && (
            <p className="text-xs text-neutral-500 dark:text-neutral-500 flex items-center gap-1">
              <Phone size={12} aria-hidden="true" />
              {address.telephone}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          {!address.is_default && (
            <button
              onClick={() => onSetDefault(address.id)}
              className="p-2 text-neutral-400 hover:text-gold-500 transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-label="Définir comme adresse par défaut"
              title="Définir par défaut"
            >
              <Star size={16} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={() => onEdit(address)}
            className="p-2 text-neutral-400 hover:text-blue-500 transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={`Modifier l'adresse ${address.nom}`}
            title="Modifier"
          >
            <Edit2 size={16} aria-hidden="true" />
          </button>
          <button
            onClick={() => onDelete(address.id)}
            disabled={isDeleting}
            className="p-2 text-neutral-400 hover:text-red-500 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label={`Supprimer l'adresse ${address.nom}`}
            title="Supprimer"
          >
            {isDeleting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */
export default function AddressesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const toast = useToast()

  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [villes, setVilles] = useState<Ville[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryCountRef = useRef(0)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    mode: 'onChange',
  })

  const watchedProvince = watch('province_id')
  const watchedVille = watch('ville_id')

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/profile/addresses')
    }
  }, [user, authLoading, router])

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

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Fetch avec retry
  const fetchWithRetry = useCallback(
    async (url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
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
          retryCountRef.current += 1
          await new Promise((r) => setTimeout(r, 1000 * retryCountRef.current))
          return fetchWithRetry(url, options, retries - 1)
        }
        throw err
      }
    },
    []
  )

  // Chargement des données géographiques
  const loadGeoData = useCallback(async () => {
    try {
      const [provincesRes, villesRes, communesRes] = await Promise.all([
        fetchWithRetry('/api/public/provinces'),
        fetchWithRetry('/api/public/villes'),
        fetchWithRetry('/api/public/communes'),
      ])

      const provincesData = await provincesRes.json().catch(() => [])
      const villesData = await villesRes.json().catch(() => [])
      const communesData = await communesRes.json().catch(() => [])

      setProvinces(Array.isArray(provincesData) ? provincesData : provincesData.data || [])
      setVilles(Array.isArray(villesData) ? villesData : villesData.data || [])
      setCommunes(Array.isArray(communesData) ? communesData : communesData.data || [])
    } catch (err) {
      console.error('Erreur chargement données géo:', err)
    }
  }, [fetchWithRetry])

  // Chargement des adresses
  const loadAddresses = useCallback(async () => {
    if (!user) return
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setLoading(true)
    setError('')
    retryCountRef.current = 0

    try {
      const res = await fetchWithRetry('/api/user/addresses')
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
        throw new Error(data.error || ERROR_MESSAGES.load_failed)
      }

      const addressesList = Array.isArray(data) ? data : data.data || []
      setAddresses(addressesList)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.unknown)
      }
    } finally {
      setLoading(false)
    }
  }, [user, isOnline, fetchWithRetry])

  useEffect(() => {
    if (user) {
      loadGeoData()
      loadAddresses()
    }
  }, [user, loadGeoData, loadAddresses])

  // Filtrage des villes/communes selon sélection
  const filteredVilles = watchedProvince
    ? villes.filter(v => v.province_id === watchedProvince)
    : []

  const filteredCommunes = watchedVille
    ? communes.filter(c => c.ville_id === watchedVille)
    : []

  // Reset ville/commune quand province change
  useEffect(() => {
    if (watchedProvince) {
      setValue('ville_id', '')
      setValue('commune_id', '')
    }
  }, [watchedProvince, setValue])

  useEffect(() => {
    if (watchedVille) {
      setValue('commune_id', '')
    }
  }, [watchedVille, setValue])

  // Ouvrir modal ajout
  const handleAdd = useCallback(() => {
    setEditingAddress(null)
    reset({
      nom: '',
      province_id: '',
      ville_id: '',
      commune_id: '',
      quartier: '',
      avenue: '',
      numero: '',
      reference: '',
      telephone: '',
    })
    setIsModalOpen(true)
  }, [reset])

  // Ouvrir modal édition
  const handleEdit = useCallback((address: UserAddress) => {
    setEditingAddress(address)
    reset({
      nom: address.nom || '',
      province_id: address.province_id || '',
      ville_id: address.ville_id || '',
      commune_id: address.commune_id || '',
      quartier: address.quartier || '',
      avenue: address.avenue || '',
      numero: address.numero || '',
      reference: address.reference || '',
      telephone: address.telephone || '',
    })
    setIsModalOpen(true)
  }, [reset])

  // Sauvegarder adresse
  const onSubmit = useCallback(async (data: AddressForm) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setSaving(true)
    setError('')
    retryCountRef.current = 0

    try {
      const payload = {
        ...data,
        telephone: data.telephone ? normalizePhone(data.telephone) : null,
        adresse_text: formatAddress(
          { ...data, id: '', created_at: '' } as UserAddress,
          provinces,
          villes,
          communes
        ),
      }

      const url = editingAddress
        ? `/api/user/addresses/${editingAddress.id}`
        : '/api/user/addresses'

      const method = editingAddress ? 'PUT' : 'POST'

      const res = await fetchWithRetry(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status >= 500) throw new Error(ERROR_MESSAGES.server)
        throw new Error(result.error || ERROR_MESSAGES.save_failed)
      }

      // Succès
      toast.show({
        type: 'success',
        message: editingAddress ? 'Adresse modifiée' : 'Adresse ajoutée',
        duration: 3000,
      })

      setIsModalOpen(false)
      await loadAddresses()
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(ERROR_MESSAGES.timeout)
      } else if (err.name === 'TypeError' || !navigator.onLine) {
        setError(ERROR_MESSAGES.network)
      } else {
        setError(err.message || ERROR_MESSAGES.save_failed)
      }
    } finally {
      setSaving(false)
    }
  }, [isOnline, editingAddress, provinces, villes, communes, fetchWithRetry, loadAddresses, toast])

  // Définir par défaut
  const handleSetDefault = useCallback(async (id: string) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    try {
      const res = await fetchWithRetry(`/api/user/addresses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })

      if (!res.ok) throw new Error(ERROR_MESSAGES.save_failed)

      toast.show({
        type: 'success',
        message: 'Adresse définie par défaut',
        duration: 3000,
      })

      await loadAddresses()
    } catch (err: any) {
      setError(err.message || ERROR_MESSAGES.save_failed)
    }
  }, [isOnline, fetchWithRetry, loadAddresses, toast])

  // Supprimer adresse
  const handleDelete = useCallback(async (id: string) => {
    if (!isOnline) {
      setError(ERROR_MESSAGES.offline)
      return
    }

    setDeletingId(id)
    setError('')

    try {
      const res = await fetchWithRetry(`/api/user/addresses/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || ERROR_MESSAGES.delete_failed)
      }

      setAddresses(prev => prev.filter(a => a.id !== id))
      
      toast.show({
        type: 'success',
        message: 'Adresse supprimée',
        duration: 3000,
      })
    } catch (err: any) {
      setError(err.message || ERROR_MESSAGES.delete_failed)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }, [isOnline, fetchWithRetry, toast])

  if (authLoading || !user) return null

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-3xl">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-6 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
          aria-label="Retour au profil"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Retour au profil
        </Link>

        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif flex items-center gap-2">
                <MapPin size={28} className="text-gold-500" aria-hidden="true" />
                Mes adresses
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Gérez vos adresses de livraison
              </p>
            </div>
            <Button
              variant="luxe"
              onClick={handleAdd}
              disabled={!isOnline}
              className="shadow-gold hover:shadow-glow-gold"
            >
              <Plus size={18} className="mr-2" aria-hidden="true" />
              Ajouter
            </Button>
          </div>

          {/* Hors ligne */}
          {!isOnline && (
            <div
              role="alert"
              className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-sm flex items-center gap-2 animate-slide-down"
            >
              <WifiOff size={18} className="flex-shrink-0" aria-hidden="true" />
              Vous êtes hors ligne.
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-2 animate-slide-down"
            >
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Liste des adresses */}
          {loading ? (
            <div className="space-y-4" role="status" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="h-5 w-40 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                      <div className="h-4 w-64 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                      <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-8 w-8 bg-neutral-200 dark:bg-neutral-700 rounded-lg animate-pulse" />
                      <div className="h-8 w-8 bg-neutral-200 dark:bg-neutral-700 rounded-lg animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : addresses.length === 0 ? (
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-12 text-center">
                <Home size={48} className="mx-auto text-neutral-300 dark:text-neutral-600 mb-4" aria-hidden="true" />
                <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
                  Aucune adresse enregistrée
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                  Ajoutez votre première adresse de livraison pour passer commande plus rapidement.
                </p>
                <Button
                  variant="luxe"
                  onClick={handleAdd}
                  disabled={!isOnline}
                  className="shadow-gold hover:shadow-glow-gold"
                >
                  <Plus size={18} className="mr-2" aria-hidden="true" />
                  Ajouter une adresse
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="p-6 space-y-4">
                {addresses.map((address) => (
                  <AddressCard
                    key={address.id}
                    address={address}
                    provinces={provinces}
                    villes={villes}
                    communes={communes}
                    onEdit={handleEdit}
                    onDelete={(id) => setConfirmDeleteId(id)}
                    onSetDefault={handleSetDefault}
                    isDeleting={deletingId === address.id}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </Container>

      {/* Modal ajout/édition */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAddress ? 'Modifier l\'adresse' : 'Nouvelle adresse'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Nom de l'adresse"
            {...register('nom')}
            error={errors.nom?.message}
            placeholder="Maison, Bureau, etc."
            leftIcon={<Home size={16} className="text-neutral-400" aria-hidden="true" />}
            aria-describedby={errors.nom ? 'nom-error' : undefined}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              label="Province"
              {...register('province_id')}
              error={errors.province_id?.message}
              aria-describedby={errors.province_id ? 'province-error' : undefined}
            >
              <option value="">Sélectionner</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </Select>

            <Select
              label="Ville"
              {...register('ville_id')}
              error={errors.ville_id?.message}
              disabled={!watchedProvince}
              aria-describedby={errors.ville_id ? 'ville-error' : undefined}
            >
              <option value="">Sélectionner</option>
              {filteredVilles.map((v) => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </Select>

            <Select
              label="Commune"
              {...register('commune_id')}
              error={errors.commune_id?.message}
              disabled={!watchedVille}
              aria-describedby={errors.commune_id ? 'commune-error' : undefined}
            >
              <option value="">Sélectionner</option>
              {filteredCommunes.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Quartier"
              {...register('quartier')}
              error={errors.quartier?.message}
              placeholder="Ex: Gombe"
              aria-describedby={errors.quartier ? 'quartier-error' : undefined}
            />
            <Input
              label="Avenue"
              {...register('avenue')}
              error={errors.avenue?.message}
              placeholder="Ex: Avenue du Commerce"
              aria-describedby={errors.avenue ? 'avenue-error' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Numéro"
              {...register('numero')}
              error={errors.numero?.message}
              placeholder="Ex: 123"
              aria-describedby={errors.numero ? 'numero-error' : undefined}
            />
            <Input
              label="Téléphone"
              type="tel"
              {...register('telephone')}
              error={errors.telephone?.message}
              placeholder="0812345678"
              leftIcon={<Phone size={16} className="text-neutral-400" aria-hidden="true" />}
              aria-describedby={errors.telephone ? 'telephone-error' : 'telephone-hint'}
            />
          </div>

          <Input
            label="Point de repère (optionnel)"
            {...register('reference')}
            error={errors.reference?.message}
            placeholder="Ex: Près du marché central"
            leftIcon={<Building2 size={16} className="text-neutral-400" aria-hidden="true" />}
            aria-describedby={errors.reference ? 'reference-error' : undefined}
          />

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
            >
              <X size={16} className="mr-2" aria-hidden="true" />
              Annuler
            </Button>
            <Button
              type="submit"
              variant="luxe"
              fullWidth
              loading={saving}
              disabled={saving || !isOnline}
              className="shadow-gold hover:shadow-glow-gold"
              aria-busy={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  Enregistrement...
                </span>
              ) : (
                <>
                  <CheckCircle2 size={18} className="mr-2" aria-hidden="true" />
                  {editingAddress ? 'Modifier' : 'Ajouter'}
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Supprimer cette adresse ?"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Cette action est irréversible. L'adresse sera définitivement supprimée de votre compte.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setConfirmDeleteId(null)}
              disabled={deletingId !== null}
            >
              Annuler
            </Button>
            <Button
              variant="luxe"
              fullWidth
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              loading={deletingId !== null}
              disabled={deletingId !== null}
              className="bg-red-500 hover:bg-red-600 border-red-500"
            >
              <Trash2 size={16} className="mr-2" aria-hidden="true" />
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

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