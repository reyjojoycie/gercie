// components/AddressForm.tsx
'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  MapPin, Navigation, Loader2, CheckCircle2, AlertTriangle, X,
  Home, Building, Briefcase, Heart, Plus, Search, LocateFixed
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Schéma Zod – Validation robuste                                            */
/* ========================================================================== */

const addressSchema = z.object({
  label: z.string().min(1, 'Libellé requis').max(50),
  nom_complet: z.string().min(3, 'Nom complet requis'),
  telephone: z.string().regex(/^0[0-9]{9}$/, 'Format invalide (ex: 0812345678)'),
  province: z.string().min(1, 'Province requise'),
  ville: z.string().min(1, 'Ville requise'),
  commune: z.string().min(1, 'Commune requise'),
  quartier: z.string().min(1, 'Quartier requis'),
  avenue: z.string().optional(),
  numero: z.string().optional(),
  reference: z.string().optional(),
  code_postal: z.string().optional(),
  type: z.enum(['domicile', 'bureau', 'autre']),
  est_principale: z.boolean().default(false),
  instructions_livraison: z.string().max(200).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
})

type AddressFormValues = z.infer<typeof addressSchema>

/* ========================================================================== */
/*  Données statiques (à remplacer par API)                                    */
/* ========================================================================== */

const provincesRDC = [
  'Kinshasa', 'Kongo Central', 'Kwango', 'Kwilu', 'Mai-Ndombe',
  'Équateur', 'Sud-Ubangi', 'Nord-Ubangi', 'Mongala', 'Tshuapa',
  'Tshopo', 'Bas-Uele', 'Haut-Uele', 'Ituri', 'Haut-Lomami',
  'Lualaba', 'Haut-Katanga', 'Lomami', 'Kasaï', 'Kasaï Central',
  'Kasaï Oriental', 'Sankuru', 'Maniema', 'Sud-Kivu', 'Nord-Kivu', 'Tanganyika'
]

const communesKinshasa = [
  'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu',
  'Kasa-Vubu', 'Kimbanseke', 'Kinshasa', 'Kintambo', 'Kisenso',
  'Lemba', 'Limete', 'Lingwala', 'Makala', 'Maluku',
  'Masina', 'Matete', 'Mont-Ngafula', 'Ndjili', 'Ngaba',
  'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao'
]

/* ========================================================================== */
/*  Composant AddressForm                                                      */
/* ========================================================================== */

interface AddressFormProps {
  /** Valeurs initiales (pour édition) */
  initialValues?: Partial<AddressFormValues>
  /** Mode création ou édition */
  mode?: 'create' | 'edit'
  /** Callback lors de la sauvegarde réussie */
  onSave: (address: AddressFormValues) => Promise<void> | void
  /** Callback annulation */
  onCancel?: () => void
  /** Afficher le formulaire dans une carte */
  showCard?: boolean
  /** Titre personnalisé */
  title?: string
  /** Classe additionnelle */
  className?: string
}

export function AddressForm({
  initialValues = {},
  mode = 'create',
  onSave,
  onCancel,
  showCard = true,
  title,
  className,
}: AddressFormProps) {
  const { user } = useAuth()
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [useCurrentLocation, setUseCurrentLocation] = useState(false)

  const defaultValues: AddressFormValues = {
    label: '',
    nom_complet: user?.user_metadata?.full_name || '',
    telephone: user?.phone || '',
    province: 'Kinshasa',
    ville: 'Kinshasa',
    commune: '',
    quartier: '',
    avenue: '',
    numero: '',
    reference: '',
    code_postal: '',
    type: 'domicile',
    est_principale: false,
    instructions_livraison: '',
    latitude: null,
    longitude: null,
    ...initialValues,
  }

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues,
  })

  const province = watch('province')
  const ville = watch('ville')
  const type = watch('type')

  // Communes dynamiques selon la province/ville (simplifié pour Kinshasa)
  const communes = province === 'Kinshasa' ? communesKinshasa : []

  // Détection de la localisation
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non supportée par votre navigateur')
      return
    }
    setDetectingLocation(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValue('latitude', position.coords.latitude)
        setValue('longitude', position.coords.longitude)
        setUseCurrentLocation(true)
        setDetectingLocation(false)
        toast.addToast({ type: 'success', message: 'Position détectée !' })
      },
      (error) => {
        setLocationError('Impossible d’obtenir votre position. Vérifiez les permissions.')
        setDetectingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const onSubmit = async (data: AddressFormValues) => {
    setIsSaving(true)
    try {
      await onSave(data)
      toast.addToast({ type: 'success', message: mode === 'create' ? 'Adresse ajoutée' : 'Adresse mise à jour' })
      if (mode === 'create') reset(defaultValues)
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message || 'Erreur lors de l’enregistrement' })
    } finally {
      setIsSaving(false)
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Type d'adresse */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Type d'adresse</label>
        <div className="flex gap-3">
          {[
            { value: 'domicile', label: 'Domicile', icon: <Home size={18} /> },
            { value: 'bureau', label: 'Bureau', icon: <Building size={18} /> },
            { value: 'autre', label: 'Autre', icon: <Heart size={18} /> },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue('type', opt.value as any)}
              className={cn(
                'flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left',
                type === opt.value
                  ? 'border-gold-400 bg-gold-50/50 dark:bg-gold-900/20 shadow-gold'
                  : 'border-border hover:border-gold-400/50'
              )}
            >
              <span className={type === opt.value ? 'text-gold-500' : 'text-muted-foreground'}>{opt.icon}</span>
              <span className="font-medium text-sm">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Libellé */}
      <Controller
        name="label"
        control={control}
        render={({ field }) => (
          <Input
            label="Libellé *"
            placeholder="Ex: Maison, Bureau Kinshasa"
            {...field}
            error={errors.label?.message}
            variant="glass"
          />
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nom complet */}
        <Controller
          name="nom_complet"
          control={control}
          render={({ field }) => (
            <Input
              label="Nom complet *"
              placeholder="Votre nom"
              {...field}
              error={errors.nom_complet?.message}
              variant="glass"
            />
          )}
        />
        {/* Téléphone */}
        <Controller
          name="telephone"
          control={control}
          render={({ field }) => (
            <Input
              label="Téléphone *"
              placeholder="0812345678"
              {...field}
              error={errors.telephone?.message}
              variant="glass"
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Province */}
        <Controller
          name="province"
          control={control}
          render={({ field }) => (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Province *</label>
              <select
                value={field.value}
                onChange={field.onChange}
                className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 text-sm"
              >
                {provincesRDC.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.province && <p className="text-xs text-red-500">{errors.province.message}</p>}
            </div>
          )}
        />
        {/* Ville */}
        <Controller
          name="ville"
          control={control}
          render={({ field }) => (
            <Input
              label="Ville *"
              placeholder="Kinshasa"
              {...field}
              error={errors.ville?.message}
              variant="glass"
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Commune */}
        <Controller
          name="commune"
          control={control}
          render={({ field }) => (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Commune *</label>
              {communes.length > 0 ? (
                <select
                  value={field.value}
                  onChange={field.onChange}
                  className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {communes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <Input
                  placeholder="Commune"
                  {...field}
                  error={errors.commune?.message}
                  variant="glass"
                />
              )}
              {errors.commune && <p className="text-xs text-red-500">{errors.commune.message}</p>}
            </div>
          )}
        />
        {/* Quartier */}
        <Controller
          name="quartier"
          control={control}
          render={({ field }) => (
            <Input
              label="Quartier *"
              placeholder="Ex: Matonge"
              {...field}
              error={errors.quartier?.message}
              variant="glass"
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Avenue */}
        <Controller
          name="avenue"
          control={control}
          render={({ field }) => (
            <Input label="Avenue" placeholder="Ex: Avenue du Commerce" {...field} variant="glass" />
          )}
        />
        {/* Numéro */}
        <Controller
          name="numero"
          control={control}
          render={({ field }) => (
            <Input label="Numéro" placeholder="N°12" {...field} variant="glass" />
          )}
        />
        {/* Code postal */}
        <Controller
          name="code_postal"
          control={control}
          render={({ field }) => (
            <Input label="Code postal" placeholder="Facultatif" {...field} variant="glass" />
          )}
        />
      </div>

      {/* Référence */}
      <Controller
        name="reference"
        control={control}
        render={({ field }) => (
          <Input
            label="Point de repère"
            placeholder="Ex: Près de la poste, derrière la pharmacie"
            {...field}
            variant="glass"
          />
        )}
      />

      {/* Instructions de livraison */}
      <Controller
        name="instructions_livraison"
        control={control}
        render={({ field }) => (
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Instructions de livraison (optionnel)</label>
            <textarea
              value={field.value || ''}
              onChange={field.onChange}
              rows={2}
              maxLength={200}
              className="w-full p-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none text-sm"
              placeholder="Code portail, étage, etc."
            />
          </div>
        )}
      />

      {/* Géolocalisation */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline-gold"
          size="sm"
          onClick={detectLocation}
          loading={detectingLocation}
          leftIcon={<LocateFixed size={14} />}
        >
          {detectingLocation ? 'Détection...' : 'Utiliser ma position actuelle'}
        </Button>
        {useCurrentLocation && (
          <Badge variant="accent" size="sm">
            <CheckCircle2 size={12} className="mr-1" /> Position détectée
          </Badge>
        )}
        {locationError && (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} /> {locationError}
          </span>
        )}
      </div>

      {/* Adresse principale */}
      <Controller
        name="est_principale"
        control={control}
        render={({ field }) => (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.value}
              onChange={field.onChange}
              className="text-gold-500 rounded focus:ring-gold-400"
            />
            <span className="text-sm text-foreground">Définir comme adresse principale</span>
          </label>
        )}
      />

      {/* Boutons */}
      <div className="flex gap-3 pt-4 border-t border-border">
        <Button
          type="submit"
          variant="luxe"
          size="md"
          loading={isSaving}
          disabled={!isDirty}
        >
          {mode === 'create' ? 'Ajouter l’adresse' : 'Mettre à jour'}
        </Button>
        {onCancel && (
          <Button variant="outline-gold" size="md" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  )

  const wrappedContent = showCard ? (
    <div className={cn('bg-card rounded-2xl border border-border p-4 md:p-6 shadow-card', className)}>
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-foreground">{title || 'Adresse de livraison'}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === 'create'
            ? 'Ajoutez une nouvelle adresse pour vos livraisons'
            : 'Modifiez les informations de votre adresse'}
        </p>
      </div>
      {formContent}
    </div>
  ) : (
    formContent
  )

  return wrappedContent
}