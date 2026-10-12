// app/profile/favoris/page.tsx
'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'

// ✅ FIX : Suppression des accolades car ce sont des exports par défaut (default exports)
import ProductCard from '@/components/ProductCard'
import ProductQuickView from '@/components/ProductQuickView'

// ✅ FIX : Importation des composants UI Dropdown manquants
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  Heart, ShoppingBag, Trash2, Sparkles, ChevronLeft,
  ArrowUpDown, Search, Filter, List, Grid3X3,
  Plus, Bookmark, X, Check, Gift, Share2, Package,
  Loader2, AlertTriangle, Eye, Copy, ChevronDown, Tag,
  RefreshCw, ArrowLeft, Edit // ✅ FIX : Ajout de l'icône 'Edit' manquante pour Lucide
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Types enrichis                                                     */
/* ------------------------------------------------------------------ */

interface Product {
  id: string
  nom: string
  prix: number
  prix_usd?: number
  images: string[]
  vendeur?: { boutique_nom: string }
  categorie?: string
  created_at?: string
  description?: string
  stock?: number
  rating?: number
}

interface Wishlist {
  id: string
  name: string
  items: string[] // product ids
  isDefault?: boolean
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function FavorisPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { addItem: addToCart } = useCart()

  // États locaux
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'price-asc' | 'price-desc' | 'name'>('date')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null)
  const [activeWishlistId, setActiveWishlistId] = useState<string>('default')
  const [wishlists, setWishlists] = useState<Wishlist[]>([
    { id: 'default', name: 'Favoris', items: [], isDefault: true }
  ])
  const [showCreateWishlist, setShowCreateWishlist] = useState(false)
  const [newWishlistName, setNewWishlistName] = useState('')
  const [editingWishlist, setEditingWishlist] = useState<string | null>(null)

  // Récupération des produits favoris via API
  const {
    data: products = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Product[]>({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/favoris')
      if (!res.ok) throw new Error('Erreur chargement favoris')
      return res.json()
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  })

  // Synchronisation des wishlists (simulation – en réalité il faudrait une table)
  useEffect(() => {
    if (products.length > 0) {
      setWishlists(prev => {
        const updated = [...prev]
        const defaultWish = updated.find(w => w.isDefault)
        if (defaultWish) {
          defaultWish.items = products.map(p => p.id)
        }
        return updated
      })
    }
  }, [products])

  // Filtrage et tri
  const filteredProducts = useMemo(() => {
    let list = products

    // Filtre par wishlist
    const activeWish = wishlists.find(w => w.id === activeWishlistId)
    if (activeWish && !activeWish.isDefault) {
      const ids = new Set(activeWish.items)
      list = list.filter(p => ids.has(p.id))
    }

    // Recherche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(p =>
        p.nom.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      )
    }

    // Tri
    switch (sortBy) {
      case 'price-asc':
        list = [...list].sort((a, b) => a.prix - b.prix)
        break
      case 'price-desc':
        list = [...list].sort((a, b) => b.prix - a.prix)
        break
      case 'name':
        list = [...list].sort((a, b) => a.nom.localeCompare(b.nom))
        break
      default:
        break // date (garder l'ordre de l'API)
    }

    return list
  }, [products, searchQuery, sortBy, activeWishlistId, wishlists])

  // Mutations
  const removeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/favoris?produit_id=${productId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
      return productId
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Product[]>(['favorites', user?.id], (old) =>
        (old || []).filter(p => p.id !== id)
      )
      toast.addToast({ type: 'info', message: 'Retiré des favoris' })
    },
    onError: () => {
      toast.addToast({ type: 'error', message: 'Erreur lors de la suppression' })
    },
  })

  const removeMultiple = useCallback(async () => {
    if (selectedProducts.size === 0) return
    const ids = Array.from(selectedProducts)
    try {
      await Promise.all(ids.map(id => removeMutation.mutateAsync(id)))
      setSelectedProducts(new Set())
      setSelectMode(false)
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de la suppression multiple' })
    }
  }, [selectedProducts, removeMutation, toast])

  const clearAll = async () => {
    if (!confirm('Vider tous les favoris ?')) return
    try {
      await Promise.all(products.map(p => removeMutation.mutateAsync(p.id)))
      toast.addToast({ type: 'info', message: 'Tous les favoris ont été supprimés' })
    } catch { }
  }

  // Wishlist management
  const createWishlist = () => {
    if (!newWishlistName.trim()) return
    const id = Date.now().toString()
    setWishlists(prev => [...prev, { id, name: newWishlistName.trim(), items: [] }])
    setNewWishlistName('')
    setShowCreateWishlist(false)
    setActiveWishlistId(id)
    toast.addToast({ type: 'success', message: `Collection "${newWishlistName}" créée` })
  }

  const renameWishlist = (id: string, newName: string) => {
    if (!newName.trim()) return
    setWishlists(prev => prev.map(w => w.id === id ? { ...w, name: newName.trim() } : w))
    setEditingWishlist(null)
  }

  const deleteWishlist = (id: string) => {
    if (wishlists.find(w => w.id === id)?.isDefault) return
    setWishlists(prev => prev.filter(w => w.id !== id))
    if (activeWishlistId === id) setActiveWishlistId('default')
  }

  const addToWishlist = (productId: string, wishlistId: string) => {
    setWishlists(prev => prev.map(w => {
      if (w.id === wishlistId && !w.items.includes(productId)) {
        return { ...w, items: [...w.items, productId] }
      }
      return w
    }))
    toast.addToast({ type: 'success', message: 'Ajouté à la collection' })
  }

  const toggleSelect = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={48} className="animate-spin text-gold-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState
          icon={<Heart size={48} className="text-gold-400" />}
          title="Connexion requise"
          description="Connectez-vous pour voir vos favoris."
          actionLabel="Se connecter"
          onAction={() => router.push('/login?redirect=/profile/favoris')}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        {/* En-tête */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/profile" className="p-2 rounded-xl hover:bg-gold-400/10 transition-colors text-muted-foreground hover:text-gold-500">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground font-serif">Mes favoris</h1>
            <p className="text-muted-foreground text-sm">
              {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} dans vos collections
            </p>
          </div>
        </div>

        {/* Barre d'outils */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                leftIcon={<Search size={18} className="text-muted-foreground" />}
                placeholder="Rechercher dans mes favoris..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                allowClear
                onClear={() => setSearchQuery('')}
                variant="glass"
              />
            </div>
            <div className="flex gap-2">
              <Dropdown
                trigger={
                  <Button variant="outline-gold" size="sm" leftIcon={<ArrowUpDown size={14} />}>
                    {sortBy === 'date' ? 'Récemment ajoutés' : sortBy === 'price-asc' ? 'Prix ↑' : sortBy === 'price-desc' ? 'Prix ↓' : 'Nom'}
                  </Button>
                }
                align="left"
              >
                <DropdownItem onClick={() => setSortBy('date')}>Récemment ajoutés</DropdownItem>
                <DropdownItem onClick={() => setSortBy('price-asc')}>Prix croissant</DropdownItem>
                <DropdownItem onClick={() => setSortBy('price-desc')}>Prix décroissant</DropdownItem>
                <DropdownItem onClick={() => setSortBy('name')}>Nom (A-Z)</DropdownItem>
              </Dropdown>
              <div className="flex items-center rounded-full bg-muted p-1 border border-border">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn('p-1.5 rounded-full transition', viewMode === 'grid' ? 'bg-gold-500 text-white' : 'text-muted-foreground')}
                >
                  <Grid3X3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('p-1.5 rounded-full transition', viewMode === 'list' ? 'bg-gold-500 text-white' : 'text-muted-foreground')}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {selectMode ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedProducts.size} sélectionné(s)</span>
                <Button variant="danger" size="sm" onClick={removeMultiple} loading={removeMutation.isPending}>
                  <Trash2 size={14} className="mr-1" /> Supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedProducts(new Set()) }}>
                  Annuler
                </Button>
              </div>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} leftIcon={<Check size={14} />}>
                  Sélectionner
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} leftIcon={<Trash2 size={14} className="text-red-500" />}>
                  Tout supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateWishlist(true)} leftIcon={<Plus size={14} />}>
                  Nouvelle collection
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Wishlists (collections) */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {wishlists.map(w => (
            <button
              key={w.id}
              onClick={() => setActiveWishlistId(w.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap flex items-center gap-2',
                activeWishlistId === w.id
                  ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                  : 'bg-card text-foreground border border-border hover:border-gold-400'
              )}
            >
              <Bookmark size={14} />
              {editingWishlist === w.id ? (
                <input
                  value={w.name}
                  onChange={(e) => renameWishlist(w.id, e.target.value)}
                  onBlur={() => setEditingWishlist(null)}
                  className="bg-transparent outline-none text-white max-w-[100px]"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                w.name
              )}
              {!w.isDefault && (
                <span className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditingWishlist(w.id) }} className="hover:text-white/70">
                    <Edit size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteWishlist(w.id) }} className="hover:text-red-300">
                    <X size={12} />
                  </button>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className={cn('grid gap-4 md:gap-6', viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-4')}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 shadow-card border border-border">
                <Skeleton variant="rectangular" className="w-full aspect-square rounded-xl mb-3" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-3/4 mb-2" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-1/2" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Heart size={48} className="text-gold-400" />}
            title="Aucun favori"
            description={searchQuery ? 'Aucun produit trouvé.' : 'Ajoutez des produits à vos favoris depuis le catalogue.'}
            actionLabel="Découvrir des produits"
            onAction={() => router.push('/')}
          />
        ) : (
          <div className={cn('grid gap-4 md:gap-6', viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-4')}>
            <AnimatePresence>
              {filteredProducts.map((product, idx) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.02 }}
                  className="relative group"
                >
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-20">
                      <button
                        onClick={() => toggleSelect(product.id)}
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          selectedProducts.has(product.id)
                            ? 'bg-gold-500 border-gold-500 text-white'
                            : 'border-neutral-400 bg-white/70 dark:bg-neutral-800/70'
                        )}
                      >
                        {selectedProducts.has(product.id) && <Check size={12} />}
                      </button>
                    </div>
                  )}
                  <ProductCard
                    product={product}
                    variant={viewMode === 'list' ? 'list' : 'grid'}
                  />
                  {/* Quick actions overlay */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Tooltip content="Ajouter au panier">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCart({ id: product.id, nom: product.nom, prix: product.prix, image: product.images?.[0] }, 1) }}
                        className="p-1.5 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-md hover:bg-gold-100"
                      >
                        <ShoppingBag size={16} className="text-gold-600" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Aperçu rapide">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickViewProductId(product.id) }}
                        className="p-1.5 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-md hover:bg-gold-100"
                      >
                        <Eye size={16} className="text-gold-600" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Retirer des favoris">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(product.id) }}
                        className="p-1.5 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-md hover:bg-red-100"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </Tooltip>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Container>

      {/* Quick View Modal */}
      {quickViewProductId && (
        <ProductQuickView productId={quickViewProductId} onClose={() => setQuickViewProductId(null)} />
      )}

      {/* Create Wishlist Modal */}
      <Modal isOpen={showCreateWishlist} onClose={() => setShowCreateWishlist(false)} title="Nouvelle collection" size="sm" accent="gold">
        <Input
          value={newWishlistName}
          onChange={e => setNewWishlistName(e.target.value)}
          placeholder="Nom de la collection"
          variant="glass"
        />
        <Button variant="luxe" className="mt-4" onClick={createWishlist}>
          Créer
        </Button>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}