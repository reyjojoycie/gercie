'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { Modal } from '@/components/ui/Modal'
import PhotoUpload from '@/components/PhotoUpload'
import {
  Image as ImageIcon, Save, Eye, EyeOff, ArrowUp, ArrowDown,
  GripVertical, Search, X, Upload, Download, RotateCcw,
  Filter, LayoutGrid, List, AlertTriangle, CheckCircle2,
  MoreHorizontal, Copy, Info, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { motion, AnimatePresence, Reorder } from 'framer-motion'

interface CategoryConfig {
  id: string
  category_id: string
  display_name: string | null
  image_url: string | null
  ordre: number
  actif: boolean
}

export default function AdminHomeCategoriesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [items, setItems] = useState<CategoryConfig[]>([])
  const [originalItems, setOriginalItems] = useState<CategoryConfig[]>([])  // pour undo
  const [search, setSearch] = useState('')
  const [filterActif, setFilterActif] = useState<'all' | 'actif' | 'inactif'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data: configs, isLoading } = useQuery<CategoryConfig[]>({
    queryKey: ['admin-home-categories'],
    queryFn: () => fetch('/api/admin/home-categories').then(r => r.json()),
  })

  useEffect(() => {
    if (configs && Array.isArray(configs)) {
      const sorted = [...configs].sort((a, b) => a.ordre - b.ordre)
      setItems(sorted)
      setOriginalItems(JSON.parse(JSON.stringify(sorted)))
    } else if (configs) {
      setItems([])
      setOriginalItems([])
    }
  }, [configs])

  // Détecter les modifications
  useEffect(() => {
    setHasChanges(JSON.stringify(items) !== JSON.stringify(originalItems))
  }, [items, originalItems])

  // Filtrer localement
  const filtered = useMemo(() => {
    return items.filter(item => {
      const name = item.display_name || item.category_id
      const matchSearch = name.toLowerCase().includes(debouncedSearch.toLowerCase())
      const matchStatut = filterActif === 'all' || (filterActif === 'actif' ? item.actif : !item.actif)
      return matchSearch && matchStatut
    })
  }, [items, debouncedSearch, filterActif])

  // Stats
  const stats = useMemo(() => ({
    total: items.length,
    actifs: items.filter(i => i.actif).length,
    inactifs: items.filter(i => !i.actif).length,
    avecImage: items.filter(i => i.image_url).length,
  }), [items])

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<CategoryConfig>[]) => {
      const res = await fetch('/api/admin/home-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-home-categories'] })
      setOriginalItems(JSON.parse(JSON.stringify(items)))
      setHasChanges(false)
      toast.addToast({ type: 'success', message: 'Configuration enregistrée !' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const updateItem = (id: string, field: keyof CategoryConfig, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= newItems.length) return
    ;[newItems[index], newItems[target]] = [newItems[target], newItems[index]]
    newItems.forEach((item, i) => { item.ordre = i + 1 })
    setItems(newItems)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkToggle = (actif: boolean) => {
    setItems(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, actif } : item))
    setSelectedIds(new Set())
  }

  const handleReorder = (reordered: CategoryConfig[]) => {
    const updated = reordered.map((item, index) => ({ ...item, ordre: index + 1 }))
    setItems(updated)
  }

  const handleSave = () => {
    const payload = items.map(({ id, display_name, image_url, ordre, actif }) => ({
      id,
      display_name: display_name?.trim() || null,
      image_url: image_url?.trim() || null,
      ordre,
      actif,
    }))
    saveMutation.mutate(payload)
  }

  const handleReset = () => {
    if (confirm('Réinitialiser aux dernières valeurs sauvegardées ?')) {
      setItems(JSON.parse(JSON.stringify(originalItems)))
    }
  }

  const handleExportCSV = () => {
    const headers = ['Catégorie', 'Nom affiché', 'Image', 'Ordre', 'Actif']
    const rows = items.map(i => [i.category_id, i.display_name, i.image_url, i.ordre, i.actif ? 'Oui' : 'Non'])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'categories_accueil.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImageUploaded = (id: string, url: string) => {
    updateItem(id, 'image_url', url)
    setUploadingId(null)
  }

  // Empêcher la fermeture si modifications non sauvegardées
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" variant="premium" /></div>
  }

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
              <Layers size={28} className="text-gold-500" />
              Catégories populaires – Page d’accueil
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.total} catégories · {stats.actifs} actives · {stats.avecImage} avec image
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline-gold" size="sm" onClick={handleExportCSV} leftIcon={<Download size={14} />}>CSV</Button>
            <Button variant="outline-gold" size="sm" onClick={() => setShowPreview(true)} leftIcon={<Eye size={14} />}>Aperçu</Button>
            {hasChanges && (
              <Button variant="ghost" size="sm" onClick={handleReset} leftIcon={<RotateCcw size={14} />} className="text-red-500">
                Annuler modifs
              </Button>
            )}
            <Button variant="luxe" onClick={handleSave} loading={saveMutation.isPending}>
              <Save size={16} className="mr-2" /> Enregistrer
            </Button>
          </div>
        </div>

        {/* Stats & filtres */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, icon: <Layers size={16} className="text-gold-500" /> },
            { label: 'Actives', value: stats.actifs, icon: <CheckCircle2 size={16} className="text-green-500" /> },
            { label: 'Inactives', value: stats.inactifs, icon: <EyeOff size={16} className="text-red-500" /> },
            { label: 'Avec image', value: stats.avecImage, icon: <ImageIcon size={16} className="text-blue-500" /> },
          ].map((s, i) => (
            <div key={i} className="bg-card rounded-xl p-3 border border-border flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">{s.icon}</div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="font-bold">{s.value}</p></div>
            </div>
          ))}
        </div>

        {/* Barre d'outils */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <Input variant="glass" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" allowClear onClear={() => setSearch('')} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'actif', 'inactif'] as const).map(f => (
              <button key={f} onClick={() => setFilterActif(f)}
                className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition border',
                  filterActif === f ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm' : 'bg-card border-border text-muted-foreground hover:border-gold-400')}>
                {f === 'all' ? 'Toutes' : f === 'actif' ? 'Actives' : 'Inactives'}
              </button>
            ))}
            <button onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-gold-500">
              {viewMode === 'list' ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">{selectedIds.size} sélectionné(s)</span>
              <Button variant="accent" size="sm" onClick={() => bulkToggle(true)}>Activer</Button>
              <Button variant="danger" size="sm" onClick={() => bulkToggle(false)}>Désactiver</Button>
            </div>
          )}
        </div>

        {/* Liste ou grille */}
        {filtered.length === 0 ? (
          <Card variant="glass" className="p-8 text-center text-muted-foreground">
            Aucune catégorie trouvée.
          </Card>
        ) : viewMode === 'list' ? (
          <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="grid gap-4">
            <AnimatePresence>
              {filtered.map((item, index) => {
                const realIndex = items.findIndex(i => i.id === item.id)
                return (
                  <Reorder.Item key={item.id} value={item}>
                    <Card variant="glass" className="group">
                      <CardContent className="flex items-center gap-4 p-4 flex-wrap md:flex-nowrap">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} className="text-gold-500 rounded" />
                          <GripVertical size={16} className="text-neutral-400 cursor-grab" />
                        </div>
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 border">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={20} /></div>
                          )}
                        </div>
                        <div className="flex-1 grid gap-3 grid-cols-1 sm:grid-cols-2 min-w-0">
                          <Input
                            label={`Nom affiché (${item.category_id})`}
                            value={item.display_name || ''}
                            placeholder={item.category_id}
                            onChange={e => updateItem(item.id, 'display_name', e.target.value)}
                          />
                          <div>
                            <label className="text-xs font-medium mb-1 block">URL image</label>
                            <div className="flex gap-2 items-center">
                              <Input
                                value={item.image_url || ''}
                                onChange={e => updateItem(item.id, 'image_url', e.target.value)}
                                placeholder="URL"
                                className="flex-1"
                              />
                              <PhotoUpload
                                onUpload={(url) => handleImageUploaded(item.id, url)}
                                bucket="photos-produits"
                                folder="categories"
                                label=""
                                aspectRatio="square"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Tooltip content={item.actif ? 'Visible' : 'Masquée'}>
                            <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => updateItem(item.id, 'actif', !item.actif)}>
                              {item.actif ? <Eye size={18} className="text-green-500" /> : <EyeOff size={18} className="text-neutral-400" />}
                            </Button>
                          </Tooltip>
                          <div className="flex flex-col sm:flex-row gap-1">
                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => moveItem(realIndex, 'up')} disabled={realIndex === 0}>
                              <ArrowUp size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => moveItem(realIndex, 'down')} disabled={realIndex === items.length - 1}>
                              <ArrowDown size={16} />
                            </Button>
                          </div>
                          <Badge variant="neutral" className="ml-2 font-mono">#{item.ordre}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Reorder.Item>
                )
              })}
            </AnimatePresence>
          </Reorder.Group>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(item => (
              <Card key={item.id} variant="glass" className="group">
                <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-t-xl overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={40} /></div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Tooltip content={item.actif ? 'Désactiver' : 'Activer'}>
                      <button onClick={() => updateItem(item.id, 'actif', !item.actif)} className="p-1.5 bg-white/80 rounded-full">
                        {item.actif ? <Eye size={14} className="text-green-500" /> : <EyeOff size={14} className="text-red-500" />}
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="font-medium truncate">{item.display_name || item.category_id}</p>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant={item.actif ? 'accent' : 'danger'} size="sm">{item.actif ? 'Actif' : 'Inactif'}</Badge>
                    <Input
                      value={item.image_url || ''}
                      onChange={e => updateItem(item.id, 'image_url', e.target.value)}
                      placeholder="URL"
                      className="w-20 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </motion.div>

      {/* Modal aperçu */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Aperçu de la page d'accueil" size="lg" accent="gold">
        <div className="grid grid-cols-2 gap-4">
          {items.filter(i => i.actif).sort((a, b) => a.ordre - b.ordre).slice(0, 8).map(item => (
            <div key={item.id} className="p-3 bg-card rounded-xl border border-border text-center">
              <div className="w-full aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden mb-2">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={32} /></div>
                )}
              </div>
              <p className="text-sm font-medium">{item.display_name || item.category_id}</p>
            </div>
          ))}
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}