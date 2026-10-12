// components/LivraisonFilters.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import { useTheme } from '@/contexts/ThemeContext'
import { useDebounce } from '@/hooks/useDebounce'
import {
  Search, Filter, X, RotateCcw, SlidersHorizontal, Calendar,
  Tag, MapPin, ChevronDown, ChevronUp, Check, Clock, Star, GripHorizontal,
  ArrowUpDown, Save, Bookmark, History, Download, Upload, AlertTriangle, Eye,
} from 'lucide-react'
import { z } from 'zod'

/* ========================================================================== */
/*  Types de filtres                                                          */
/* ========================================================================== */

export type StatutLivraison = 'acceptee' | 'colis_recupere' | 'en_cours' | 'livree' | 'annulee' | 'toutes'

export interface LivraisonFiltersValues {
  statut: StatutLivraison
  recherche: string
  dateDebut: string             // ISO date ou ''
  dateFin: string               // ISO date ou ''
  tri: 'date' | 'distance' | 'statut' | 'priorite'
  ordre: 'asc' | 'desc'
  zoneId: string | null         // ID de zone de livraison
  seulementRetard: boolean
  seulementPrioritaire: boolean
}

interface LivraisonFiltersProps {
  /** Valeurs initiales ou contrôlées */
  filters?: Partial<LivraisonFiltersValues>
  /** Callback à chaque changement de filtre (déclenché après debounce pour la recherche) */
  onChange: (filters: LivraisonFiltersValues) => void
  /** Nombre total de résultats (pour l'affichage) */
  totalResults?: number
  /** Chargement (désactive les interactions) */
  loading?: boolean
  /** Erreur à afficher */
  error?: string | null
  /** Classes additionnelles */
  className?: string
  /** Activer la sauvegarde locale des filtres */
  enableLocalSave?: boolean
  /** Clé unique pour le stockage local (ex: 'livreur-filters') */
  storageKey?: string
  /** Personnaliser les statuts affichés (tous par défaut) */
  allowedStatuts?: StatutLivraison[]
}

/* ========================================================================== */
/*  Valeurs par défaut                                                        */
/* ========================================================================== */

const DEFAULT_FILTERS: LivraisonFiltersValues = {
  statut: 'toutes',
  recherche: '',
  dateDebut: '',
  dateFin: '',
  tri: 'date',
  ordre: 'desc',
  zoneId: null,
  seulementRetard: false,
  seulementPrioritaire: false,
}

// Liste des statuts de livraison avec libellés et couleurs (pour les badges)
const STATUTS: { value: StatutLivraison; label: string; color: string; icon: React.ComponentType<any> }[] = [
  { value: 'toutes', label: 'Toutes', color: 'neutral', icon: Filter },
  { value: 'acceptee', label: 'Acceptée', color: 'blue', icon: Clock },
  { value: 'colis_recupere', label: 'Collectée', color: 'purple', icon: Tag },
  { value: 'en_cours', label: 'En cours', color: 'amber', icon: Clock },
  { value: 'livree', label: 'Livrée', color: 'emerald', icon: Check },
  { value: 'annulee', label: 'Annulée', color: 'red', icon: X },
]

// Options de tri
const OPTIONS_TRI = [
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'distance', label: 'Distance', icon: GripHorizontal },
  { value: 'statut', label: 'Statut', icon: Filter },
  { value: 'priorite', label: 'Priorité', icon: Star },
]

/* ========================================================================== */
/*  Helper localStorage                                                       */
/* ========================================================================== */

const saveFiltersToLocal = (key: string, filters: LivraisonFiltersValues) => {
  try {
    localStorage.setItem(key, JSON.stringify(filters))
  } catch {}
}
const loadFiltersFromLocal = (key: string): Partial<LivraisonFiltersValues> | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/* ========================================================================== */
/*  Composant principal                                                       */
/* ========================================================================== */

function LivraisonFiltersComponent({
  filters: externalFilters,
  onChange,
  totalResults,
  loading = false,
  error = null,
  className,
  enableLocalSave = false,
  storageKey = 'livraison-filters',
  allowedStatuts = ['toutes', 'acceptee', 'colis_recupere', 'en_cours', 'livree', 'annulee'],
}: LivraisonFiltersProps) {
  const { theme } = useTheme()

  // Initialisation des filtres internes
  const [internalFilters, setInternalFilters] = useState<LivraisonFiltersValues>(() => {
    // Priorité : props > localStorage > défaut
    if (externalFilters) return { ...DEFAULT_FILTERS, ...externalFilters }
    if (enableLocalSave) {
      const saved = loadFiltersFromLocal(storageKey)
      if (saved) return { ...DEFAULT_FILTERS, ...saved }
    }
    return DEFAULT_FILTERS
  })

  // Synchroniser avec les props si elles changent (contrôlé)
  useEffect(() => {
    if (externalFilters) {
      setInternalFilters(prev => ({ ...prev, ...externalFilters }))
    }
  }, [externalFilters])

  // État pour l'expansion du panneau de filtres avancés
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [savedPreset, setSavedPreset] = useState(false)

  // Recherche avec debounce
  const [searchInput, setSearchInput] = useState(internalFilters.recherche)
  const debouncedSearch = useDebounce(searchInput, 400)

  // Mettre à jour la recherche dans les filtres et déclencher onChange
  useEffect(() => {
    if (debouncedSearch !== internalFilters.recherche) {
      setInternalFilters(prev => ({ ...prev, recherche: debouncedSearch }))
    }
  }, [debouncedSearch])

  // Propager les changements au parent
  useEffect(() => {
    onChange(internalFilters)
    if (enableLocalSave) {
      saveFiltersToLocal(storageKey, internalFilters)
    }
  }, [internalFilters, onChange, enableLocalSave, storageKey])

  // Helpers pour modifier un champ
  const updateFilter = useCallback(<K extends keyof LivraisonFiltersValues>(key: K, value: LivraisonFiltersValues[K]) => {
    setInternalFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleFilter = useCallback((key: keyof LivraisonFiltersValues) => {
    setInternalFilters(prev => ({ ...prev, [key]: !prev[key] as any }))
  }, [])

  const resetFilters = useCallback(() => {
    setInternalFilters(DEFAULT_FILTERS)
    setSearchInput('')
    setSavedPreset(false)
  }, [])

  // Sauvegarde du preset actuel
  const handleSavePreset = useCallback(() => {
    saveFiltersToLocal(`${storageKey}-preset`, internalFilters)
    setSavedPreset(true)
    setTimeout(() => setSavedPreset(false), 2000)
  }, [internalFilters, storageKey])

  // Charger un preset sauvegardé
  const handleLoadPreset = useCallback(() => {
    const saved = loadFiltersFromLocal(`${storageKey}-preset`)
    if (saved) {
      const restored = { ...DEFAULT_FILTERS, ...saved }
      setInternalFilters(restored)
      setSearchInput(restored.recherche || '')
    }
  }, [storageKey])

  // Filtres rapides (dates)
  const setDateQuick = (range: 'today' | 'week' | 'month') => {
    const now = new Date()
    let start = ''
    const end = now.toISOString().split('T')[0]
    if (range === 'today') {
      start = end
    } else if (range === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      start = d.toISOString().split('T')[0]
    } else if (range === 'month') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      start = d.toISOString().split('T')[0]
    }
    setInternalFilters(prev => ({ ...prev, dateDebut: start, dateFin: end }))
  }

  // Comptage des filtres actifs (pour badge)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (internalFilters.statut !== 'toutes') count++
    if (internalFilters.recherche) count++
    if (internalFilters.dateDebut || internalFilters.dateFin) count++
    if (internalFilters.tri !== 'date' || internalFilters.ordre !== 'desc') count++
    if (internalFilters.zoneId) count++
    if (internalFilters.seulementRetard) count++
    if (internalFilters.seulementPrioritaire) count++
    return count
  }, [internalFilters])

  // Statuts autorisés
  const displayedStatuts = STATUTS.filter(s => allowedStatuts.includes(s.value))

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white dark:bg-midnight-900 rounded-2xl border border-neutral-200 dark:border-midnight-500/30 shadow-card p-4 sm:p-5 space-y-4',
        className
      )}
    >
      {/* En-tête avec compteur et actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gold-500" />
          <h3 className="text-base font-bold text-neutral-900 dark:text-white">Filtres</h3>
          {activeFilterCount > 0 && (
            <Badge variant="gold" size="sm">{activeFilterCount} actif{activeFilterCount > 1 ? 's' : ''}</Badge>
          )}
          {totalResults !== undefined && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
              ({totalResults} résultat{totalResults !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Tooltip content="Réinitialiser tous les filtres">
              <Button variant="ghost" size="sm" onClick={resetFilters} leftIcon={<RotateCcw size={14} />}>
                Réinitialiser
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Sauvegarder ces filtres">
            <Button variant="ghost" size="icon" onClick={handleSavePreset}>
              <Save size={16} className={savedPreset ? 'text-emerald-500' : 'text-neutral-400'} />
            </Button>
          </Tooltip>
          <Tooltip content="Charger un preset sauvegardé">
            <Button variant="ghost" size="icon" onClick={handleLoadPreset}>
              <Bookmark size={16} className="text-neutral-400" />
            </Button>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Moins' : 'Avancé'}
          </Button>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Barre de recherche et statuts */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            leftIcon={<Search size={16} />}
            placeholder="Rechercher une commande, un client..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            rightIcon={searchInput ? <X size={16} className="cursor-pointer text-neutral-400" onClick={() => setSearchInput('')} /> : undefined}
            inputSize="sm"
            disabled={loading}
            className="w-full"
          />
        </div>
      </div>

      {/* Statuts (chips) */}
      <div className="flex flex-wrap gap-2">
        {displayedStatuts.map(s => (
          <button
            key={s.value}
            onClick={() => updateFilter('statut', s.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 flex items-center gap-1',
              internalFilters.statut === s.value
                ? 'bg-gold-100 dark:bg-gold-900/30 border-gold-400 text-gold-700 dark:text-gold-300 shadow-sm'
                : 'bg-neutral-50 dark:bg-midnight-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-gold-300'
            )}
            disabled={loading}
          >
            <s.icon size={12} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Toggle rapides : retard, prioritaire */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={internalFilters.seulementRetard ? 'gold' : 'ghost'}
          size="sm"
          leftIcon={<Clock size={14} />}
          onClick={() => toggleFilter('seulementRetard')}
        >
          Retard
        </Button>
        <Button
          variant={internalFilters.seulementPrioritaire ? 'gold' : 'ghost'}
          size="sm"
          leftIcon={<Star size={14} />}
          onClick={() => toggleFilter('seulementPrioritaire')}
        >
          Prioritaire
        </Button>
      </div>

      {/* Filtres rapides de date */}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDateQuick('today')}>
          Aujourd'hui
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDateQuick('week')}>
          Cette semaine
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDateQuick('month')}>
          Ce mois
        </Button>
        {(internalFilters.dateDebut || internalFilters.dateFin) && (
          <Button variant="ghost" size="sm" onClick={() => { updateFilter('dateDebut', ''); updateFilter('dateFin', '') }}>
            <X size={14} className="mr-1" /> Effacer dates
          </Button>
        )}
      </div>

      {/* Panneau avancé (dates personnalisées, tri, zone) */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-neutral-100 dark:border-midnight-800 space-y-4">
              {/* Dates personnalisées */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                    Date début
                  </label>
                  <Input
                    type="date"
                    value={internalFilters.dateDebut}
                    onChange={e => updateFilter('dateDebut', e.target.value)}
                    inputSize="sm"
                    disabled={loading}
                    leftIcon={<Calendar size={14} />}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                    Date fin
                  </label>
                  <Input
                    type="date"
                    value={internalFilters.dateFin}
                    onChange={e => updateFilter('dateFin', e.target.value)}
                    inputSize="sm"
                    disabled={loading}
                    leftIcon={<Calendar size={14} />}
                  />
                </div>
              </div>

              {/* Tri */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                  Trier par
                </label>
                <div className="flex flex-wrap gap-2">
                  {OPTIONS_TRI.map(opt => (
                    <Button
                      key={opt.value}
                      variant={internalFilters.tri === opt.value ? 'gold' : 'outline-gold'}
                      size="sm"
                      leftIcon={<opt.icon size={14} />}
                      onClick={() => updateFilter('tri', opt.value as any)}
                      disabled={loading}
                    >
                      {opt.label}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateFilter('ordre', internalFilters.ordre === 'asc' ? 'desc' : 'asc')}
                    disabled={loading}
                    className="w-8 h-8"
                  >
                    <ArrowUpDown size={14} className={internalFilters.ordre === 'asc' ? 'rotate-180' : ''} />
                  </Button>
                </div>
              </div>

              {/* Zone (placeholder) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                  Zone de livraison
                </label>
                <Input
                  placeholder="Ex: Gombe, Lingwala..."
                  value={internalFilters.zoneId || ''}
                  onChange={e => updateFilter('zoneId', e.target.value || null)}
                  inputSize="sm"
                  leftIcon={<MapPin size={14} />}
                  disabled={loading}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Indicateur de chargement */}
      {loading && (
        <div className="absolute inset-0 bg-white/60 dark:bg-midnight-900/60 rounded-2xl flex items-center justify-center z-10">
          <Spinner size="lg" variant="gold" />
        </div>
      )}
    </motion.div>
  )
}

// Mémoïsation pour éviter les re-rendus inutiles
export default memo(LivraisonFiltersComponent)