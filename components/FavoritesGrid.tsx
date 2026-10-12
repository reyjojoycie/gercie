// components/FavoritesGrid.tsx
'use client'

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { ProductQuickView } from '@/components/ProductQuickView'
import { ProductCard } from '@/components/ProductCard'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import {
  Heart,
  ShoppingBag,
  Trash2,
  Check,
  X,
  Plus,
  Bookmark,
  Search,
  ArrowUpDown,
  Grid3X3,
  List,
  Eye,
  Gift,
  Share2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  FolderPlus,
  Star,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface FavoriteProduct {
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

export interface Wishlist {
  id: string
  name: string
  items: string[] // product ids
  isDefault?: boolean
}

export interface FavoritesGridProps {
  /** Produits favoris (contrôlé) */
  products: FavoriteProduct[]
  /** Liste des wishlists / collections */
  wishlists?: Wishlist[]
  /** ID de la wishlist active */
  activeWishlistId?: string
  /** Callback changement de collection */
  onWishlistChange?: (id: string) => void
  /** Callback suppression d'un favori */
  onRemoveFavorite?: (productId: string) => Promise<void>
  /** Callback suppression multiple */
  onRemoveMultiple?: (productIds: string[]) => Promise<void>
  /** Callback vidage total */
  onClearAll?: () => Promise<void>
  /** Callback création d'une wishlist */
  onCreateWishlist?: (name: string) => Promise<void>
  /** Callback renommage */
  onRenameWishlist?: (id: string, name: string) => Promise<void>
  /** Callback suppression d'une wishlist */
  onDeleteWishlist?: (id: string) => Promise<void>
  /** Callback déplacement d'un produit vers une wishlist */
  onMoveToWishlist?: (productId: string, wishlistId: string) => Promise<void>
  /** État de chargement */
  loading?: boolean
  /** Erreur éventuelle */
  error?: string | null
  /** Callback pour réessayer */
  onRetry?: () => void
  /** Classes additionnelles */
  className?: string
  /** Mode compact */
  compact?: boolean
}

/* ========================================================================== */
/*  Composant FavoritesGrid                                                   */
/* ========================================================================== */

export const FavoritesGrid = forwardRef<HTMLDivElement, FavoritesGridProps>(
  (
    {
      products,
      wishlists = [],
      activeWishlistId = 'default',
      onWishlistChange,
      onRemoveFavorite,
      onRemoveMultiple,
      onClearAll,
      onCreateWishlist,
      onRenameWishlist,
      onDeleteWishlist,
      onMoveToWishlist,
      loading = false,
      error = null,
      onRetry,
      className,
      compact = false,
    },
    ref
  ) => {
    const { addItem: addToCart } = useCart()
    const toast = useToast()

    // États locaux
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'date' | 'price-asc' | 'price-desc' | 'name'>('date')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
    const [selectMode, setSelectMode] = useState(false)
    const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null)
    const [showCreateWishlist, setShowCreateWishlist] = useState(false)
    const [newWishlistName, setNewWishlistName] = useState('')
    const [editingWishlistId, setEditingWishlistId] = useState<string | null>(null)
    const [editingWishlistName, setEditingWishlistName] = useState('')
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [showMoveModal, setShowMoveModal] = useState(false)
    const [moveTargetWishlist, setMoveTargetWishlist] = useState<string>('')

    // Filtrage et tri
    const filteredProducts = useMemo(() => {
      let list = products

      // Filtre par recherche
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        list = list.filter(
          p =>
            p.nom.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q)) ||
            (p.categorie && p.categorie.toLowerCase().includes(q))
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
          // date : conserver l'ordre initial
          break
      }

      return list
    }, [products, searchQuery, sortBy])

    // Actions
    const toggleSelect = (id: string) => {
      setSelectedProducts(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    const handleRemoveSelected = async () => {
      const ids = Array.from(selectedProducts)
      if (ids.length === 0) return
      setActionLoading('remove-multiple')
      try {
        if (onRemoveMultiple) {
          await onRemoveMultiple(ids)
        } else if (onRemoveFavorite) {
          await Promise.all(ids.map(id => onRemoveFavorite(id)))
        }
        setSelectedProducts(new Set())
        setSelectMode(false)
        toast.addToast({ type: 'info', message: `${ids.length} favori(s) retiré(s)` })
      } catch {
        toast.addToast({ type: 'error', message: 'Erreur lors de la suppression' })
      } finally {
        setActionLoading(null)
      }
    }

    const handleRemoveSingle = async (id: string) => {
      setActionLoading(`remove-${id}`)
      try {
        await onRemoveFavorite?.(id)
      } catch {
        toast.addToast({ type: 'error', message: 'Erreur suppression' })
      } finally {
        setActionLoading(null)
      }
    }

    const handleAddToCart = (product: FavoriteProduct) => {
      addToCart(
        {
          id: product.id,
          nom: product.nom,
          prix: product.prix,
          image: product.images?.[0],
        },
        1
      )
      toast.addToast({ type: 'success', message: `${product.nom} ajouté au panier` })
    }

    const handleCreateWishlist = async () => {
      if (!newWishlistName.trim()) return
      setActionLoading('create-wishlist')
      try {
        await onCreateWishlist?.(newWishlistName.trim())
        setNewWishlistName('')
        setShowCreateWishlist(false)
        toast.addToast({ type: 'success', message: `Collection "${newWishlistName}" créée` })
      } catch {
        toast.addToast({ type: 'error', message: 'Erreur création' })
      } finally {
        setActionLoading(null)
      }
    }

    const handleRenameWishlist = async (id: string) => {
      if (!editingWishlistName.trim()) return
      setActionLoading(`rename-${id}`)
      try {
        await onRenameWishlist?.(id, editingWishlistName.trim())
        setEditingWishlistId(null)
      } catch {
        toast.addToast({ type: 'error', message: 'Erreur renommage' })
      } finally {
        setActionLoading(null)
      }
    }

    const handleMoveProducts = async () => {
      const ids = Array.from(selectedProducts)
      if (!moveTargetWishlist || ids.length === 0) return
      setActionLoading('move')
      try {
        await Promise.all(ids.map(id => onMoveToWishlist?.(id, moveTargetWishlist)))
        toast.addToast({ type: 'success', message: `${ids.length} produit(s) déplacé(s)` })
        setShowMoveModal(false)
        setSelectedProducts(new Set())
      } catch {
        toast.addToast({ type: 'error', message: 'Erreur déplacement' })
      } finally {
        setActionLoading(null)
      }
    }

    // Rendu
    const renderSkeleton = () => (
      <div className={cn('grid gap-4 md:gap-6', viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col')}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <Skeleton variant="rectangular" className="w-full aspect-square rounded-xl mb-3" shimmer shimmerVariant="gold" />
            <Skeleton variant="text" className="w-3/4 mb-2" shimmer shimmerVariant="gold" />
            <Skeleton variant="text" className="w-1/2" shimmer shimmerVariant="gold" />
          </div>
        ))}
      </div>
    )

    const renderError = () => (
      <div className="flex flex-col items-center py-10">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        <p className="text-muted-foreground mb-4">{error}</p>
        {onRetry && (
          <Button variant="danger" size="sm" onClick={onRetry}>
            <RefreshCw size={14} className="mr-1" /> Réessayer
          </Button>
        )}
      </div>
    )

    return (
      <div ref={ref} className={cn('space-y-6', className)}>
        {/* Barre d'outils */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 flex gap-2 w-full sm:w-auto">
            <Input
              leftIcon={<Search size={16} className="text-muted-foreground" />}
              placeholder="Rechercher dans mes favoris..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
              onClear={() => setSearchQuery('')}
              variant="glass"
              size="sm"
              className="flex-1 max-w-xs"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Tri */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground"
            >
              <option value="date">Récemment ajoutés</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
              <option value="name">Nom (A-Z)</option>
            </select>

            {/* Vue */}
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

            {/* Mode sélection */}
            {selectMode ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedProducts.size} sélectionné(s)</span>
                <Button variant="danger" size="sm" onClick={handleRemoveSelected} loading={actionLoading === 'remove-multiple'}>
                  <Trash2 size={14} className="mr-1" /> Supprimer
                </Button>
                {wishlists.length > 1 && (
                  <Button variant="outline-gold" size="sm" onClick={() => setShowMoveModal(true)}>
                    <FolderPlus size={14} className="mr-1" /> Déplacer
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedProducts(new Set()) }}>
                  <X size={14} className="mr-1" /> Annuler
                </Button>
              </div>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  <Check size={14} className="mr-1" /> Sélectionner
                </Button>
                {onClearAll && products.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={onClearAll}>
                    <Trash2 size={14} className="mr-1 text-red-500" /> Tout supprimer
                  </Button>
                )}
                {onCreateWishlist && (
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateWishlist(true)}>
                    <Plus size={14} className="mr-1" /> Collection
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Wishlists (collections) */}
        {wishlists.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {wishlists.map(w => (
              <button
                key={w.id}
                onClick={() => onWishlistChange?.(w.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap flex items-center gap-2',
                  activeWishlistId === w.id
                    ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                    : 'bg-card text-foreground border border-border hover:border-gold-400'
                )}
              >
                <Bookmark size={14} />
                {editingWishlistId === w.id ? (
                  <input
                    value={editingWishlistName}
                    onChange={e => setEditingWishlistName(e.target.value)}
                    onBlur={() => handleRenameWishlist(w.id)}
                    onKeyDown={e => e.key === 'Enter' && handleRenameWishlist(w.id)}
                    className="bg-transparent outline-none text-white max-w-[100px]"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  w.name
                )}
                {!w.isDefault && editingWishlistId !== w.id && (
                  <span className="flex gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingWishlistId(w.id); setEditingWishlistName(w.name) }}
                      className="hover:opacity-70"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    {onDeleteWishlist && (
                      <button onClick={e => { e.stopPropagation(); onDeleteWishlist(w.id) }} className="hover:text-red-300">
                        <X size={12} />
                      </button>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Grille / Liste */}
        {loading ? (
          renderSkeleton()
        ) : error ? (
          renderError()
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Heart size={48} className="text-muted-foreground" />}
            title="Aucun favori"
            description={searchQuery ? 'Aucun produit trouvé.' : 'Ajoutez des produits à vos favoris.'}
            actionLabel={searchQuery ? 'Effacer la recherche' : 'Découvrir des produits'}
            onAction={searchQuery ? () => setSearchQuery('') : () => window.location.href = '/'}
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
                  <ProductCard product={product} variant={viewMode === 'list' ? 'list' : 'grid'} />
                  {/* Quick actions overlay */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Tooltip content="Ajouter au panier">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToCart(product) }}
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
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveSingle(product.id) }}
                        disabled={actionLoading === `remove-${product.id}`}
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

        {/* Quick View Modal */}
        {quickViewProductId && (
          <ProductQuickView productId={quickViewProductId} onClose={() => setQuickViewProductId(null)} />
        )}

        {/* Modal création collection */}
        <Modal isOpen={showCreateWishlist} onClose={() => setShowCreateWishlist(false)} title="Nouvelle collection" size="sm" accent="gold">
          <Input
            value={newWishlistName}
            onChange={e => setNewWishlistName(e.target.value)}
            placeholder="Nom de la collection"
            variant="glass"
          />
          <Button variant="luxe" className="mt-4" onClick={handleCreateWishlist} loading={actionLoading === 'create-wishlist'}>
            Créer
          </Button>
        </Modal>

        {/* Modal déplacer */}
        <Modal isOpen={showMoveModal} onClose={() => setShowMoveModal(false)} title={`Déplacer ${selectedProducts.size} produit(s)`} size="sm" accent="gold">
          <div className="space-y-3">
            {wishlists.filter(w => w.id !== activeWishlistId).map(w => (
              <button
                key={w.id}
                onClick={() => setMoveTargetWishlist(w.id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border-2 transition',
                  moveTargetWishlist === w.id ? 'border-gold-400 bg-gold-50' : 'border-border hover:border-gold-400/50'
                )}
              >
                <Bookmark size={16} className="inline mr-2" />{w.name}
              </button>
            ))}
            <Button variant="luxe" fullWidth onClick={handleMoveProducts} loading={actionLoading === 'move'} disabled={!moveTargetWishlist}>
              Déplacer
            </Button>
          </div>
        </Modal>
      </div>
    )
  }
)

FavoritesGrid.displayName = 'FavoritesGrid'