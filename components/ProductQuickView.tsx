// components/ProductQuickView.tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useToast } from '@/components/ui/Toast' // système de toast amélioré
import { useExchangeRate } from '@/hooks/useExchangeRate'
import {
  Heart,
  Share2,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Truck,
  Shield,
  RotateCcw,
  Loader2,
  Eye,
  X,
  Check,
  ExternalLink,
  Info,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types (alignés avec Product de ProductGrid)                       */
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
  rating?: number
  reviews_count?: number
  stock?: number
  discount?: number
  // Variantes éventuelles
  variants?: { id: string; label: string; options: string[] }[]
  selectedVariant?: Record<string, string>
}

/* ------------------------------------------------------------------ */
/*  Hook useProduct (simulé ici, à déplacer dans hooks/useProduct.ts) */
/* ------------------------------------------------------------------ */
function useProduct(productId: string) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productId) return
    setLoading(true)
    // Simulation d'appel API – remplacer par votre vrai fetch
    const timer = setTimeout(() => {
      // Produit mocké pour démo
      setProduct({
        id: productId,
        nom: 'Produit exemple',
        prix: 150,
        prix_usd: 75,
        images: ['/placeholder.jpg', '/placeholder2.jpg'],
        vendeur: { boutique_nom: 'Boutique Premium' },
        description: "Une description détaillée du produit avec toutes ses caractéristiques.",
        rating: 4.5,
        reviews_count: 128,
        stock: 15,
        discount: 10,
        variants: [
          { id: 'couleur', label: 'Couleur', options: ['Noir', 'Blanc', 'Or'] },
          { id: 'taille', label: 'Taille', options: ['S', 'M', 'L'] },
        ],
      })
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [productId])

  return { product, loading, error }
}

/* ------------------------------------------------------------------ */
/*  Composant ProductQuickView                                         */
/* ------------------------------------------------------------------ */
interface ProductQuickViewProps {
  productId: string
  onClose: () => void
  isOpen?: boolean // contrôlé en dehors, sinon on part du principe qu'il est ouvert dès le montage
}

export default function ProductQuickView({
  productId,
  onClose,
  isOpen = true,
}: ProductQuickViewProps) {
  const { product, loading, error } = useProduct(productId)
  const { addToCart } = useCart()
  const { toggleFavorite, isFavorite } = useFavorites(productId)
  const toast = useToast()
  const { convert, symbol } = useExchangeRate()

  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [added, setAdded] = useState(false)

  // Gestion des variantes
  const handleVariantChange = (variantId: string, option: string) => {
    setSelectedVariants((prev) => ({ ...prev, [variantId]: option }))
  }

  const images = product?.images || []
  const displayPrice = product ? convert(product.prix) : 0
  const discountedPrice = product?.discount
    ? displayPrice * (1 - product.discount / 100)
    : displayPrice

  // Ajout au panier avec feedback
  const handleAddToCart = async () => {
    if (!product) return
    setIsAdding(true)
    try {
      await addToCart(product.id, quantity, selectedVariants)
      setAdded(true)
      toast.addToast({
        type: 'success',
        title: 'Ajouté au panier',
        message: `${product.nom} x${quantity}`,
        duration: 3000,
      })
      setTimeout(() => setAdded(false), 2000)
    } catch (err) {
      toast.addToast({
        type: 'error',
        message: "Erreur lors de l'ajout au panier",
      })
    } finally {
      setIsAdding(false)
    }
  }

  // Navigation images
  const prevImage = () => setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length)
  const nextImage = () => setSelectedImageIndex((prev) => (prev + 1) % images.length)

  // Touche clavier
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevImage()
      else if (e.key === 'ArrowRight') nextImage()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      accent="gold"
      showCloseButton={false}
      className="overflow-hidden"
    >
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="animate-spin text-gold-500" size={32} />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-danger">
          <p>{error}</p>
          <Button variant="outline" onClick={onClose} className="mt-4">Fermer</Button>
        </div>
      ) : product ? (
        <div className="flex flex-col md:flex-row">
          {/* Section images */}
          <div className="relative w-full md:w-1/2 bg-neutral-100 dark:bg-midnight-800 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative w-full aspect-square"
              >
                <Image
                  src={images[selectedImageIndex] || '/placeholder.jpg'}
                  alt={product.nom}
                  fill
                  className="object-cover"
                />
              </motion.div>
            </AnimatePresence>
            {/* Flèches */}
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/70 dark:bg-black/40 text-neutral-700 dark:text-white hover:bg-white transition"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/70 dark:bg-black/40 text-neutral-700 dark:text-white hover:bg-white transition"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            {/* Indicateurs */}
            {images.length > 1 && (
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === selectedImageIndex ? 'bg-gold-500 w-4' : 'bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
            {product.discount ? (
              <Badge variant="danger" className="absolute top-3 left-3 animate-pulse">
                -{product.discount}%
              </Badge>
            ) : null}
          </div>

          {/* Détails */}
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{product.categorie}</p>
                  <h2 className="text-2xl font-bold text-foreground mt-1">{product.nom}</h2>
                  {product.vendeur?.boutique_nom && (
                    <p className="text-sm text-muted-foreground mt-1">Vendu par {product.vendeur.boutique_nom}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Rating */}
              {product.rating && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex items-center text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={16}
                        className={i < Math.floor(product.rating!) ? 'fill-current' : 'text-neutral-300'}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{product.rating}</span>
                  <span className="text-sm text-muted-foreground">({product.reviews_count} avis)</span>
                </div>
              )}

              {/* Prix */}
              <div className="mt-4">
                {product.discount ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gold-600">
                      {symbol}{discountedPrice.toFixed(2)}
                    </span>
                    <span className="text-lg text-muted-foreground line-through">
                      {symbol}{displayPrice.toFixed(2)}
                    </span>
                    <Badge variant="danger" size="sm">-{product.discount}%</Badge>
                  </div>
                ) : (
                  <span className="text-3xl font-bold text-foreground">
                    {symbol}{displayPrice.toFixed(2)}
                  </span>
                )}
                {product.prix_usd && (
                  <p className="text-sm text-muted-foreground mt-1">≈ {product.prix_usd} USD</p>
                )}
              </div>

              {/* Variantes */}
              {product.variants?.map((variant) => (
                <div key={variant.id} className="mt-4">
                  <label className="text-sm font-medium text-foreground">{variant.label}</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {variant.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleVariantChange(variant.id, opt)}
                        className={cn(
                          'px-3 py-1.5 text-sm rounded-full border transition-all',
                          selectedVariants[variant.id] === opt
                            ? 'border-gold-500 bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300'
                            : 'border-neutral-200 dark:border-neutral-700 hover:border-gold-400'
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Quantité + Stock */}
              <div className="flex items-center gap-4 mt-6">
                <div className="flex items-center border border-neutral-200 dark:border-neutral-700 rounded-xl">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock || 10, quantity + 1))}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {product.stock && product.stock <= 5 ? (
                  <p className="text-sm text-danger">Plus que {product.stock} en stock</p>
                ) : (
                  <p className="text-sm text-success">En stock</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <Button
                  variant="luxe"
                  size="lg"
                  className="flex-1"
                  onClick={handleAddToCart}
                  loading={isAdding}
                  leftIcon={added ? <Check size={18} /> : <ShoppingCart size={18} />}
                >
                  {added ? 'Ajouté !' : 'Ajouter au panier'}
                </Button>
                <Tooltip content={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                  <Button
                    variant="outline-gold"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => toggleFavorite(product.id)}
                  >
                    <Heart size={18} className={isFavorite ? 'fill-gold-500 text-gold-500' : ''} />
                  </Button>
                </Tooltip>
                <Tooltip content="Partager">
                  <Button
                    variant="outline-gold"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: product.nom, url: window.location.href })
                      }
                    }}
                  >
                    <Share2 size={18} />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Infos livraison & garantie */}
            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
              <div className="flex flex-col items-center text-center gap-1">
                <Truck size={20} className="text-gold-500" />
                <span className="text-xs text-muted-foreground">Livraison rapide</span>
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <Shield size={20} className="text-gold-500" />
                <span className="text-xs text-muted-foreground">Garantie 1 an</span>
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <RotateCcw size={20} className="text-gold-500" />
                <span className="text-xs text-muted-foreground">Retours gratuits</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}