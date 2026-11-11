// app/profile/favoris/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'

import ProductCard from '@/components/ProductCard'
import ProductQuickView from '@/components/ProductQuickView'

import { Dropdown, DropdownItem } from '@/components/ui/Dropdown'
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
  AlertTriangle,
  ArrowUpDown,
  Bookmark,
  Check,
  ChevronLeft,
  Edit,
  Eye,
  Grid3X3,
  Heart,
  List,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string
  nom: string
  prix?: number | null
  prix_usd?: number | null
  images?: string[] | string | null
  vendeur?: { boutique_nom?: string | null } | null
  categorie?: string | null
  created_at?: string | null
  description?: string | null
  stock?: number | null
  rating?: number | null
  [key: string]: any
}

interface Wishlist {
  id: string
  name: string
  items: string[]
  isDefault?: boolean
}

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const FAVORIS_REDIRECT = '/profile/favoris'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getProductPrice(product: Product): number {
  const prix = Number(product.prix ?? product.prix_usd ?? 0)
  return Number.isFinite(prix) ? prix : 0
}

function getFirstImage(images?: string[] | string | null): string | undefined {
  if (Array.isArray(images)) {
    return images.find((image) => typeof image === 'string' && image.trim())
  }

  if (typeof images === 'string' && images.trim()) {
    return images
  }

  return undefined
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function FavorisPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { addItem: addToCart } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'price-asc' | 'price-desc' | 'name'>('date')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null)

  const [activeWishlistId, setActiveWishlistId] = useState<string>('default')
  const [wishlists, setWishlists] = useState<Wishlist[]>([
    {
      id: 'default',
      name: 'Favoris',
      items: [],
      isDefault: true,
    },
  ])

  const [showCreateWishlist, setShowCreateWishlist] = useState(false)
  const [newWishlistName, setNewWishlistName] = useState('')
  const [editingWishlist, setEditingWishlist] = useState<string | null>(null)

  /* ---------------------------------------------------------------- */
  /* Auth guard                                                       */
  /* ---------------------------------------------------------------- */

  const requireAuth = useCallback(
    (message: string) => {
      if (authLoading) {
        toast.addToast({
          type: 'info',
          message: 'Connexion en cours, veuillez patienter…',
        })
        return false
      }

      if (user) return true

      toast.addToast({
        type: 'warning',
        message,
      })

      router.push(`/login?redirect=${encodeURIComponent(FAVORIS_REDIRECT)}`)
      return false
    },
    [authLoading, router, toast, user]
  )

  /* ---------------------------------------------------------------- */
  /* Query favoris                                                    */
  /* ---------------------------------------------------------------- */

  const {
    data: rawProducts = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<Product[]>({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/favoris', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        if (res.status === 401) return []
        throw new Error('Erreur chargement favoris')
      }

      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    enabled: !!user && !authLoading,
    staleTime: 2 * 60 * 1000,
  })

  const products = useMemo(
    () =>
      Array.isArray(rawProducts)
        ? rawProducts.filter((product): product is Product => Boolean(product?.id))
        : [],
    [rawProducts]
  )

  /* ---------------------------------------------------------------- */
  /* Sync wishlist par défaut                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setWishlists((prev) =>
      prev.map((wishlist) =>
        wishlist.isDefault
          ? {
              ...wishlist,
              items: products.map((product) => product.id),
            }
          : wishlist
      )
    )
  }, [products])

  /* ---------------------------------------------------------------- */
  /* Filtrage / tri                                                   */
  /* ---------------------------------------------------------------- */

  const filteredProducts = useMemo(() => {
    let list = [...products]

    const activeWishlist = wishlists.find((wishlist) => wishlist.id === activeWishlistId)

    if (activeWishlist && !activeWishlist.isDefault) {
      const ids = new Set(activeWishlist.items)
      list = list.filter((product) => ids.has(product.id))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()

      list = list.filter((product) => {
        const nom = String(product.nom || '').toLowerCase()
        const description = String(product.description || '').toLowerCase()
        return nom.includes(query) || description.includes(query)
      })
    }

    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => getProductPrice(a) - getProductPrice(b))
        break

      case 'price-desc':
        list.sort((a, b) => getProductPrice(b) - getProductPrice(a))
        break

      case 'name':
        list.sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')))
        break

      default:
        break
    }

    return list
  }, [activeWishlistId, products, searchQuery, sortBy, wishlists])

  /* ---------------------------------------------------------------- */
  /* Mutations                                                        */
  /* ---------------------------------------------------------------- */

  const removeMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(
        `/api/favoris?produit_id=${encodeURIComponent(productId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))

        if (res.status === 401) {
          throw new Error('NON_AUTHENTICATED')
        }

        throw new Error(data?.error || 'Erreur suppression')
      }

      return productId
    },
    onSuccess: (productId) => {
      queryClient.setQueryData<Product[]>(['favorites', user?.id], (old) =>
        (old || []).filter((product) => product.id !== productId)
      )

      toast.addToast({
        type: 'info',
        message: 'Retiré des favoris',
      })
    },
    onError: (error: any) => {
      if (error?.message === 'NON_AUTHENTICATED') {
        requireAuth('Veuillez vous connecter pour gérer vos favoris.')
        return
      }

      toast.addToast({
        type: 'error',
        message: error?.message || 'Erreur lors de la suppression',
      })
    },
  })

  const removeMultiple = useCallback(async () => {
    if (!requireAuth('Veuillez vous connecter pour gérer vos favoris.')) return
    if (selectedProducts.size === 0) return

    const ids = Array.from(selectedProducts)

    try {
      for (const id of ids) {
        await removeMutation.mutateAsync(id)
      }

      setSelectedProducts(new Set())
      setSelectMode(false)
    } catch {
      toast.addToast({
        type: 'error',
        message: 'Erreur lors de la suppression multiple',
      })
    }
  }, [removeMutation, requireAuth, selectedProducts, toast])

  const clearAll = useCallback(async () => {
    if (!requireAuth('Veuillez vous connecter pour gérer vos favoris.')) return
    if (products.length === 0) return

    const confirmed = window.confirm('Vider tous les favoris ?')
    if (!confirmed) return

    try {
      for (const product of products) {
        await removeMutation.mutateAsync(product.id)
      }

      toast.addToast({
        type: 'info',
        message: 'Tous les favoris ont été supprimés',
      })
    } catch {
      toast.addToast({
        type: 'error',
        message: 'Erreur lors de la suppression complète',
      })
    }
  }, [products, removeMutation, requireAuth, toast])

  /* ---------------------------------------------------------------- */
  /* Actions produit                                                  */
  /* ---------------------------------------------------------------- */

  const handleAddToCart = useCallback(
    async (product: Product) => {
      if (!requireAuth('Veuillez vous connecter pour ajouter au panier.')) return

      try {
        await addToCart(
          {
            id: product.id,
            nom: String(product.nom || 'Produit'),
            prix: getProductPrice(product),
            image: getFirstImage(product.images),
          },
          1
        )
      } catch (error: any) {
        toast.addToast({
          type: 'error',
          message: error?.message || 'Impossible d’ajouter ce produit au panier.',
        })
      }
    },
    [addToCart, requireAuth, toast]
  )

  const handleRemoveFavorite = useCallback(
    (productId: string) => {
      if (!requireAuth('Veuillez vous connecter pour gérer vos favoris.')) return
      removeMutation.mutate(productId)
    },
    [removeMutation, requireAuth]
  )

  const toggleSelect = useCallback((id: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Wishlists locales                                                */
  /* ---------------------------------------------------------------- */

  const createWishlist = useCallback(() => {
    const name = newWishlistName.trim()
    if (!name) return

    const id = `wishlist_${Date.now()}`

    setWishlists((prev) => [
      ...prev,
      {
        id,
        name,
        items: [],
      },
    ])

    setActiveWishlistId(id)
    setNewWishlistName('')
    setShowCreateWishlist(false)

    toast.addToast({
      type: 'success',
      message: `Collection "${name}" créée`,
    })
  }, [newWishlistName, toast])

  const renameWishlist = useCallback((id: string, newName: string) => {
    const name = newName.trim()
    if (!name) return

    setWishlists((prev) =>
      prev.map((wishlist) =>
        wishlist.id === id
          ? {
              ...wishlist,
              name,
            }
          : wishlist
      )
    )

    setEditingWishlist(null)
  }, [])

  const deleteWishlist = useCallback(
    (id: string) => {
      const target = wishlists.find((wishlist) => wishlist.id === id)
      if (!target || target.isDefault) return

      setWishlists((prev) => prev.filter((wishlist) => wishlist.id !== id))

      if (activeWishlistId === id) {
        setActiveWishlistId('default')
      }
    },
    [activeWishlistId, wishlists]
  )

  /* ---------------------------------------------------------------- */
  /* Rendu chargement auth                                            */
  /* ---------------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 size={40} className="animate-spin text-gold-500" />
          <p className="text-sm text-muted-foreground">Vérification de votre session…</p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Rendu non connecté                                               */
  /* ---------------------------------------------------------------- */

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<Heart size={48} className="text-gold-400" />}
          title="Connexion requise"
          description="Connectez-vous pour voir et gérer vos favoris."
          actionLabel="Se connecter"
          onAction={() => router.push(`/login?redirect=${encodeURIComponent(FAVORIS_REDIRECT)}`)}
        />
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Rendu erreur API                                                 */
  /* ---------------------------------------------------------------- */

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<AlertTriangle size={48} className="text-red-400" />}
          title="Erreur de chargement"
          description="Impossible de charger vos favoris pour le moment."
          actionLabel="Réessayer"
          onAction={() => void refetch()}
        />
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Rendu principal                                                  */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        {/* En-tête */}
        <div className="mb-6 flex items-center gap-2">
          <Link
            href="/profile"
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour au profil"
          >
            <ChevronLeft size={20} />
          </Link>

          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
              Mes favoris
            </h1>

            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''}
                {' '}
                dans vos collections
              </span>

              {isFetching && !isLoading && (
                <Loader2 size={14} className="animate-spin text-gold-500" />
              )}
            </p>
          </div>
        </div>

        {/* Barre d'outils */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                leftIcon={<Search size={18} className="text-muted-foreground" />}
                placeholder="Rechercher dans mes favoris..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                allowClear
                onClear={() => setSearchQuery('')}
                variant="glass"
              />
            </div>

            <div className="flex gap-2">
              <Dropdown
                trigger={
                  <Button variant="outline-gold" size="sm" leftIcon={<ArrowUpDown size={14} />}>
                    {sortBy === 'date'
                      ? 'Récemment ajoutés'
                      : sortBy === 'price-asc'
                        ? 'Prix ↑'
                        : sortBy === 'price-desc'
                          ? 'Prix ↓'
                          : 'Nom'}
                  </Button>
                }
                align="left"
              >
                <DropdownItem onClick={() => setSortBy('date')}>Récemment ajoutés</DropdownItem>
                <DropdownItem onClick={() => setSortBy('price-asc')}>Prix croissant</DropdownItem>
                <DropdownItem onClick={() => setSortBy('price-desc')}>Prix décroissant</DropdownItem>
                <DropdownItem onClick={() => setSortBy('name')}>Nom (A-Z)</DropdownItem>
              </Dropdown>

              <div className="flex items-center rounded-full border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'rounded-full p-1.5 transition',
                    viewMode === 'grid'
                      ? 'bg-gold-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Vue grille"
                  aria-pressed={viewMode === 'grid'}
                >
                  <Grid3X3 size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'rounded-full p-1.5 transition',
                    viewMode === 'list'
                      ? 'bg-gold-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Vue liste"
                  aria-pressed={viewMode === 'list'}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.size} sélectionné(s)
                </span>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={removeMultiple}
                  loading={removeMutation.isPending}
                  leftIcon={<Trash2 size={14} />}
                >
                  Supprimer
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectMode(false)
                    setSelectedProducts(new Set())
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectMode(true)}
                  leftIcon={<Check size={14} />}
                >
                  Sélectionner
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  leftIcon={<Trash2 size={14} className="text-red-500" />}
                >
                  Tout supprimer
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateWishlist(true)}
                  leftIcon={<Plus size={14} />}
                >
                  Nouvelle collection
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Collections */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {wishlists.map((wishlist) => (
            <button
              key={wishlist.id}
              type="button"
              onClick={() => setActiveWishlistId(wishlist.id)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition',
                activeWishlistId === wishlist.id
                  ? 'border-transparent bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold'
                  : 'border-border bg-card text-foreground hover:border-gold-400'
              )}
            >
              <Bookmark size={14} />

              {editingWishlist === wishlist.id ? (
                <input
                  value={wishlist.name}
                  onChange={(event) => renameWishlist(wishlist.id, event.target.value)}
                  onBlur={() => setEditingWishlist(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      setEditingWishlist(null)
                    }
                  }}
                  className="max-w-[120px] bg-transparent text-white outline-none"
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Renommer la collection ${wishlist.name}`}
                />
              ) : (
                <span>{wishlist.name}</span>
              )}

              {!wishlist.isDefault && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingWishlist(wishlist.id)
                    }}
                    className="transition hover:text-white/70"
                    aria-label={`Renommer ${wishlist.name}`}
                  >
                    <Edit size={12} />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteWishlist(wishlist.id)
                    }}
                    className="transition hover:text-red-300"
                    aria-label={`Supprimer ${wishlist.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div
            className={cn(
              'grid gap-4 md:gap-6',
              viewMode === 'grid'
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : 'flex flex-col gap-4'
            )}
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`favoris-skeleton-${index}`}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <Skeleton
                  variant="rectangular"
                  className="mb-3 aspect-square w-full rounded-xl"
                  shimmer
                  shimmerVariant="gold"
                />
                <Skeleton
                  variant="text"
                  className="mb-2 w-3/4"
                  shimmer
                  shimmerVariant="gold"
                />
                <Skeleton
                  variant="text"
                  className="w-1/2"
                  shimmer
                  shimmerVariant="gold"
                />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Heart size={48} className="text-gold-400" />}
            title="Aucun favori"
            description={
              searchQuery
                ? 'Aucun produit trouvé avec cette recherche.'
                : 'Ajoutez des produits à vos favoris depuis le catalogue.'
            }
            actionLabel="Découvrir des produits"
            onAction={() => router.push('/')}
          />
        ) : (
          <div
            className={cn(
              'grid gap-4 md:gap-6',
              viewMode === 'grid'
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : 'flex flex-col gap-4'
            )}
          >
            <AnimatePresence>
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  className="group relative"
                >
                  {selectMode && (
                    <div className="absolute left-2 top-2 z-20">
                      <button
                        type="button"
                        onClick={() => toggleSelect(product.id)}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded border-2 transition-all',
                          selectedProducts.has(product.id)
                            ? 'border-gold-500 bg-gold-500 text-white'
                            : 'border-neutral-400 bg-white/70 dark:bg-neutral-800/70'
                        )}
                        aria-label={`Sélectionner ${product.nom}`}
                        aria-pressed={selectedProducts.has(product.id)}
                      >
                        {selectedProducts.has(product.id) && <Check size={12} />}
                      </button>
                    </div>
                  )}

                  <ProductCard
                    product={product}
                    variant={viewMode === 'list' ? 'list' : 'grid'}
                  />

                  {/* Actions rapides */}
                  <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Tooltip content="Ajouter au panier">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void handleAddToCart(product)
                        }}
                        className="rounded-full bg-white/90 p-1.5 shadow-md transition hover:bg-gold-100 dark:bg-neutral-800/90 dark:hover:bg-gold-900/30"
                        aria-label={`Ajouter ${product.nom} au panier`}
                      >
                        <ShoppingBag size={16} className="text-gold-600" />
                      </button>
                    </Tooltip>

                    <Tooltip content="Aperçu rapide">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setQuickViewProductId(product.id)
                        }}
                        className="rounded-full bg-white/90 p-1.5 shadow-md transition hover:bg-gold-100 dark:bg-neutral-800/90 dark:hover:bg-gold-900/30"
                        aria-label={`Aperçu rapide de ${product.nom}`}
                      >
                        <Eye size={16} className="text-gold-600" />
                      </button>
                    </Tooltip>

                    <Tooltip content="Retirer des favoris">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleRemoveFavorite(product.id)
                        }}
                        className="rounded-full bg-white/90 p-1.5 shadow-md transition hover:bg-red-100 dark:bg-neutral-800/90 dark:hover:bg-red-900/30"
                        aria-label={`Retirer ${product.nom} des favoris`}
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

      {/* Aperçu rapide */}
      {quickViewProductId && (
        <ProductQuickView
          productId={quickViewProductId}
          onClose={() => setQuickViewProductId(null)}
        />
      )}

      {/* Création collection */}
      <Modal
        isOpen={showCreateWishlist}
        onClose={() => setShowCreateWishlist(false)}
        title="Nouvelle collection"
        size="sm"
        accent="gold"
      >
        <Input
          value={newWishlistName}
          onChange={(event) => setNewWishlistName(event.target.value)}
          placeholder="Nom de la collection"
          variant="glass"
          maxLength={60}
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowCreateWishlist(false)}>
            Annuler
          </Button>

          <Button variant="luxe" onClick={createWishlist} disabled={!newWishlistName.trim()}>
            Créer
          </Button>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}