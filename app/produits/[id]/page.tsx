// app/produits/[id]/page.tsx
'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  ChevronLeft, Truck, ShoppingBag, AlertCircle,
  Heart, Star, Copy, Link2, Eye, Store, Play, Sparkles,
  Share2, Shield, RotateCcw, Minus, Plus, Camera, MessageCircle,
  Clock, MapPin, CreditCard, Lock, ChevronUp, X, Loader2,
  Info, Ruler, Weight, Tag, Zap, Percent, Calendar, User, ThumbsUp,
  AlertTriangle as AlertIcon, HelpCircle, BarChart2, TrendingUp
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useFavorites } from '@/hooks/useFavorites'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import { ScrollToTop, ScrollProgressBar } from '@/components/ui/ScrollToTop'
import { Recommendations } from '@/components/Recommendations'
import ShareModal from '@/components/ShareModal'
import { ProductBadges } from '@/components/badges/ProductBadges'
import { getSimilarProducts } from '@/lib/similarProducts'
import { SpecificationsTable } from '@/components/ui/SpecificationsTable'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import ProductReviewSummary from '@/components/ProductReviewSummary' // ← Ajout Phase 7

/* ========================================================================== */
/*  Types enrichis                                                             */
/* ========================================================================== */

interface ProductDetail {
  id: string
  nom: string
  description: string
  prix: number
  prix_usd?: number | null
  images: string[]
  video_url?: string | null
  stock: number
  negociable: boolean
  categorie: string
  variantes?: Variante[]
  vendeur?: { id: string; boutique_nom: string | null } | null
  rating?: number
  reviews_count?: number
  badges?: string[]
  tags?: string
  total_ventes?: number
  specifications?: { key: string; value: string }[]
  // Nouveaux champs enrichis
  sku?: string
  barcode?: string
  marque?: string
  poids_kg?: number
  longueur_cm?: number
  largeur_cm?: number
  hauteur_cm?: number
  remise_percent?: number
  ribbon?: string
  delay_livraison?: string
  livraison_domicile?: number
  livraison_point_retrait?: number
  livraison_express?: number
  express_gratuit?: boolean
  featured?: boolean
}

interface Variante {
  id: string
  attributes: Record<string, string>
  stock: number
  prix_specifique?: number
  image?: string
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { addItem } = useCart()
  const { rate } = useExchangeRate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [selectedImage, setSelectedImage] = useState(0)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [showZoom, setShowZoom] = useState(false)
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 })
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({})
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([])
  const [hoverVariantImage, setHoverVariantImage] = useState<string | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  // Chargement produit
  const {
    data: product,
    isLoading: productLoading,
    error: productError,
  } = useQuery<ProductDetail | null>({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabaseBrowser
        .from('produits')
        .select('*')
        .eq('id', id)
        .single()
      if (error || !data) throw new Error('Produit introuvable')
      return data as ProductDetail
    },
    staleTime: 2 * 60 * 1000,
  })

  // Similarité dynamique
  const { data: similarProducts = [], isLoading: similarLoading } = useQuery({
    queryKey: ['similar-products-enhanced', product?.id, product?.categorie, product?.prix, product?.tags],
    queryFn: async () => {
      if (!product) return []
      const mainCategory = product.categorie.split(' > ')[0]
      const tags = product.tags
        ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []
      return getSimilarProducts({
        productId: product.id,
        mainCategory,
        price: product.prix,
        tags,
      })
    },
    enabled: !!product,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  const similarityTitle = useMemo(() => {
    if (!product) return 'Vous aimerez aussi'
    const tags = product.tags?.split(',').map(t => t.trim()) || []
    if (tags.length > 0 && similarProducts.some(p => (p as any)._score > 0)) return 'Le complément parfait'
    if ((product.prix ?? 0) > 1000) return 'Dans la même gamme premium'
    return 'Vous aimerez aussi'
  }, [product, similarProducts])

  const similarityDescription = useMemo(() => {
    if (!product) return ''
    const mainCategory = product.categorie.split(' > ')[0]
    return `Basé sur « ${mainCategory} » et votre budget`
  }, [product])

  const { isFavorite, toggleFavorite } = useFavorites(id)

  // Variantes
  const variantes: Variante[] = product?.variantes || []

  const availableAttrs = useMemo(() => {
    if (!variantes.length) return {}
    const attrs: Record<string, Set<string>> = {}
    variantes.forEach(v => {
      Object.entries(v.attributes).forEach(([k, val]) => {
        if (!attrs[k]) attrs[k] = new Set()
        attrs[k].add(val)
      })
    })
    const result: Record<string, string[]> = {}
    Object.entries(attrs).forEach(([k, set]) => { result[k] = Array.from(set) })
    return result
  }, [variantes])

  useEffect(() => {
    if (variantes.length > 0 && Object.keys(selectedAttrs).length === 0) {
      setSelectedAttrs(variantes[0].attributes)
    }
  }, [variantes])

  const currentVariante = useMemo(() => {
    if (!variantes.length) return null
    return variantes.find(v =>
      Object.entries(selectedAttrs).every(([k, val]) => v.attributes[k] === val)
    ) || null
  }, [selectedAttrs, variantes])

  const getAvailableOptions = (attr: string, current: Record<string, string>) => {
    const vals = new Set<string>()
    for (const v of variantes) {
      let ok = true
      for (const [k, val] of Object.entries(current)) {
        if (k !== attr && v.attributes[k] !== val) { ok = false; break }
      }
      if (ok) vals.add(v.attributes[attr])
    }
    return Array.from(vals)
  }

  const currentPriceCDF = currentVariante?.prix_specifique ?? product?.prix ?? 0
  const currentPriceUSD = rate ? currentPriceCDF / rate : 0
  const currentStock = currentVariante?.stock ?? product?.stock ?? 0
  const finalPriceCDF = currentPriceCDF * quantity
  const finalPriceUSD = currentPriceUSD * quantity

  // Image principale
  const varianteImage = currentVariante?.image
  const mediaItems = useMemo(() => {
    const items = product?.images?.map(u => ({ type: 'image' as const, url: u })) || []
    if (product?.video_url) items.push({ type: 'video' as const, url: product.video_url })
    return items
  }, [product])
  const displayedImage = hoverVariantImage || varianteImage || mediaItems[selectedImage]?.url || '/placeholder.jpg'

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPosition({ x, y })
  }

 useEffect(() => {
  if (!product) return
  const KEY = 'gercie_recent_products_v2'
  const stored = JSON.parse(localStorage.getItem(KEY) || '[]')
  // Supprimer l'élément s'il existe déjà (pour éviter les doublons)
  const filtered = stored.filter((item: any) => item.id !== product.id)
  const updated = [{ id: product.id, timestamp: Date.now() }, ...filtered].slice(0, 20)
  localStorage.setItem(KEY, JSON.stringify(updated))
}, [product])

  const addToCart = () => {
    if (!product) return
    addItem({
      id: product.id,
      nom: product.nom,
      prix: finalPriceCDF,
      quantite: quantity,
      image: product.images?.[0] || '',
      variante: currentVariante
        ? { attributes: currentVariante.attributes, prix: currentVariante.prix_specifique }
        : undefined,
    })
    toast.addToast({ type: 'success', title: 'Ajouté au panier', message: `${product.nom} (x${quantity})` })
    setQuantity(1)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    toast.addToast({ type: 'success', message: 'Lien copié !' })
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // Prix barré si remise
  const prixBarre = product?.remise_percent
    ? Math.round(currentPriceCDF / (1 - product.remise_percent / 100))
    : null

  // Frais de livraison estimés
  const fraisLivraisonEstime = product?.livraison_domicile ?? 5000

  /* ================================================================== */
  /*  États chargement / erreur / vide                                  */
  /* ================================================================== */

  if (productLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Container className="py-8">
          <Skeleton className="w-24 h-6 mb-6" />
          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-4">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <div className="flex gap-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="w-20 h-20 rounded-xl" />)}
              </div>
            </div>
            <div className="lg:col-span-5 space-y-4">
              <Skeleton className="w-1/3 h-6" />
              <Skeleton className="w-full h-10" />
              <Skeleton className="w-2/3 h-8" />
              <Skeleton className="w-1/2 h-5" />
              <Skeleton className="w-full h-12 rounded-xl" />
              <Skeleton className="w-full h-12 rounded-xl" />
            </div>
          </div>
        </Container>
      </div>
    )
  }

  if (productError || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto text-burgundy-500 mb-4" size={48} />
          <h1 className="text-2xl font-bold text-foreground mb-2">Produit introuvable</h1>
          <p className="text-muted-foreground mb-6">{(productError as Error)?.message || 'Ce produit n’existe pas ou a été retiré.'}</p>
          <Link href="/"><Button variant="luxe">Retour à l’accueil</Button></Link>
        </div>
      </div>
    )
  }

  /* ================================================================== */
  /*  Rendu principal                                                    */
  /* ================================================================== */
  return (
    <div className="min-h-screen bg-background pb-16">
      <ScrollProgressBar color="var(--color-gold-500)" height={3} />

      <Container className="py-6">
        {/* Fil d'ariane enrichi */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-gold-500 transition-colors">Accueil</Link>
            <span className="text-muted-foreground">/</span>
            <Link href={`/categories/${(product.categorie ?? '').split(' > ')[0]}`} className="text-muted-foreground hover:text-gold-500 transition-colors">
              {(product.categorie ?? '').split(' > ')[0]}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground truncate max-w-[200px]">{product.nom}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline-gold" size="sm" leftIcon={<Share2 size={14} />} onClick={() => setShowShareModal(true)}>Partager</Button>
            <Button variant="ghost" size="sm" leftIcon={<Copy size={14} />} onClick={copyLink}>
              {linkCopied ? 'Copié' : 'Lien'}
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Galerie */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
            className="lg:col-span-7 space-y-4">
            <div ref={imageRef}
              className="relative aspect-square rounded-2xl bg-card border border-border overflow-hidden shadow-card group"
              onMouseMove={showZoom ? handleMouseMove : undefined}
              onMouseEnter={() => setShowZoom(true)} onMouseLeave={() => setShowZoom(false)}>
              {mediaItems[selectedImage]?.type === 'video' ? (
                <video controls autoPlay className="w-full h-full object-contain" src={mediaItems[selectedImage].url} />
              ) : (
                <>
                  <Image src={displayedImage} alt={product.nom} fill className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 60vw" priority />
                  {showZoom && (
                    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
                      <div className="w-full h-full opacity-100" style={{
                        backgroundImage: `url(${displayedImage})`,
                        backgroundSize: '200%',
                        backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                      }} />
                    </div>
                  )}
                </>
              )}
              {currentStock <= 5 && currentStock > 0 && (
                <Badge variant="warm" size="sm" className="absolute top-3 left-3 bg-gold-400/20 text-gold-400 backdrop-blur-sm border border-gold-400/30">
                  ⚡ Plus que {currentStock}
                </Badge>
              )}
              {currentStock === 0 && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                  <Badge variant="danger" size="lg">Épuisé</Badge>
                </div>
              )}
              {/* Ruban / badge promo */}
              {product.ribbon && product.ribbon !== 'none' && (
                <Badge variant="gold" size="sm" className="absolute top-3 right-3">{product.ribbon}</Badge>
              )}
            </div>

            {/* Miniatures */}
            {mediaItems.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {mediaItems.map((m, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    className={cn('relative w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all duration-300',
                      !hoverVariantImage && !varianteImage && i === selectedImage
                        ? 'border-gold-400 shadow-gold'
                        : 'border-border opacity-70 hover:opacity-100 hover:border-gold-400/50')}>
                    {m.type === 'image' ? (
                      <Image src={m.url} alt={`${product.nom} - ${i + 1}`} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="w-full h-full bg-red-100 dark:bg-burgundy-900/30 flex items-center justify-center">
                        <Play size={20} className="text-burgundy-500" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Informations produit */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
            className="lg:col-span-5 space-y-6">
            {/* Catégorie, note, favoris */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="gold" size="sm" className="bg-gold-400/10 text-gold-600 dark:text-gold-400">
                {(product.categorie ?? '').split(' > ')[0]}
              </Badge>
              {product.marque && <Badge variant="neutral" size="sm">{product.marque}</Badge>}
              {product.rating && (
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} className={i < Math.floor(product.rating!) ? 'fill-current' : 'text-neutral-300'} />
                  ))}
                  <span className="text-xs font-medium">{product.rating}</span>
                  <span className="text-xs text-muted-foreground">({product.reviews_count || 0})</span>
                </div>
              )}
              <button onClick={toggleFavorite}
                className="ml-auto p-2 rounded-xl bg-card border border-border hover:bg-gold-400/10 transition-colors"
                title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                <Heart size={18} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'} />
              </button>
            </div>

            {/* Badges contextuels */}
            {(product.badges ?? []).length > 0 && (
              <ProductBadges badgeIds={product.badges!} size="md" className="mb-1" />
            )}

            <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight font-serif">
              {product.nom}
            </h1>

            {/* Références rapides */}
            {(product.sku || product.barcode) && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                {product.sku && <span>SKU: {product.sku}</span>}
                {product.barcode && <span>Code-barres: {product.barcode}</span>}
              </div>
            )}

            {/* Variantes avec miniatures */}
            {Object.keys(availableAttrs).length > 0 && (
              <div className="space-y-3">
                {Object.entries(availableAttrs).map(([attr, values]) => (
                  <div key={attr}>
                    <p className="text-sm font-medium text-foreground mb-2">{attr}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.map(v => {
                        const avail = getAvailableOptions(attr, selectedAttrs).includes(v)
                        const sel = selectedAttrs[attr] === v
                        const variantWithImage = variantes.find(variant => variant.attributes[attr] === v && variant.image)
                        return (
                          <button key={v} disabled={!avail}
                            onClick={() => setSelectedAttrs(prev => ({ ...prev, [attr]: v }))}
                            onMouseEnter={() => { if (variantWithImage?.image) setHoverVariantImage(variantWithImage.image) }}
                            onMouseLeave={() => setHoverVariantImage(null)}
                            className={cn('px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 flex items-center gap-2',
                              sel
                                ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-900 border-transparent shadow-gold'
                                : avail
                                  ? 'border-border text-foreground hover:border-gold-400 hover:bg-gold-400/5'
                                  : 'opacity-40 cursor-not-allowed')}>
                            {variantWithImage?.image ? (
                              <img src={variantWithImage.image} alt={v} className="w-5 h-5 rounded-full object-cover" />
                            ) : null}
                            {v}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Prix */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{finalPriceCDF.toLocaleString()}</span>
                <span className="text-lg font-semibold text-gold-600">FC</span>
                {prixBarre && (
                  <span className="text-sm line-through text-muted-foreground ml-2">{prixBarre.toLocaleString()} FC</span>
                )}
                {product.remise_percent && (
                  <Badge variant="danger" size="sm">-{product.remise_percent}%</Badge>
                )}
              </div>
              {rate && <p className="text-sm text-gold-600 dark:text-gold-400">≈ ${finalPriceUSD.toFixed(2)} USD</p>}
              {product.negociable && (
                <Badge variant="warm" size="sm" className="flex items-center gap-1 w-fit">
                  <MessageCircle size={12} /> Prix négociable
                </Badge>
              )}
              {currentStock > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Quantité</span>
                  <div className="flex items-center border border-border rounded-xl">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2 hover:bg-secondary transition"><Minus size={16} /></button>
                    <span className="w-12 text-center font-medium">{quantity}</span>
                    <button onClick={() => setQuantity(Math.min(currentStock, quantity + 1))} className="p-2 hover:bg-secondary transition"><Plus size={16} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* Livraison estimée */}
            {(product.delay_livraison || product.livraison_domicile) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                <Truck size={16} className="text-gold-500" />
                <span>Livraison : {fraisLivraisonEstime.toLocaleString()} FC</span>
                {product.delay_livraison && <span>· Délai estimé : {product.delay_livraison}</span>}
              </div>
            )}

            {/* Description */}
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {product.description}
            </p>

            {/* === NOUVEAU : Résumé IA des avis clients (Phase 7) === */}
            <ProductReviewSummary productId={product.id} />

            {/* Spécifications techniques */}
            {(product.specifications ?? []).length > 0 && (
              <SpecificationsTable specs={product.specifications!} />
            )}

            {/* Dimensions / poids */}
            {(product.poids_kg || product.longueur_cm || product.largeur_cm || product.hauteur_cm) && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {product.poids_kg && <span className="flex items-center gap-1"><Weight size={14} /> {product.poids_kg} kg</span>}
                {product.longueur_cm && <span className="flex items-center gap-1"><Ruler size={14} /> L: {product.longueur_cm} cm</span>}
                {product.largeur_cm && <span>× l: {product.largeur_cm} cm</span>}
                {product.hauteur_cm && <span>× H: {product.hauteur_cm} cm</span>}
              </div>
            )}

            {/* Tags */}
            {product.tags && (
              <div className="flex flex-wrap gap-2">
                {product.tags.split(',').map((tag, i) => (
                  <Badge key={i} variant="neutral" size="sm">{tag.trim()}</Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <Button variant="luxe" fullWidth size="xl" disabled={currentStock === 0} onClick={addToCart}
                leftIcon={<ShoppingBag size={20} />} className="shadow-gold hover:shadow-glow-gold">
                {currentStock === 0 ? 'Épuisé' : `Ajouter au panier (${quantity}) – ${finalPriceCDF.toLocaleString()} FC`}
              </Button>
            </div>

            {/* Infos livraison / sécurité */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm"><Truck size={18} className="text-gold-500" /><div><p className="font-medium text-foreground">Livraison</p><p className="text-xs text-muted-foreground">Gratuite dès 50$</p></div></div>
              <div className="flex items-center gap-2 text-sm"><Shield size={18} className="text-gold-500" /><div><p className="font-medium text-foreground">Garantie</p><p className="text-xs text-muted-foreground">1 an minimum</p></div></div>
              <div className="flex items-center gap-2 text-sm"><RotateCcw size={18} className="text-gold-500" /><div><p className="font-medium text-foreground">Retours</p><p className="text-xs text-muted-foreground">Sous 7 jours</p></div></div>
              <div className="flex items-center gap-2 text-sm"><Lock size={18} className="text-gold-500" /><div><p className="font-medium text-foreground">Paiement</p><p className="text-xs text-muted-foreground">Sécurisé</p></div></div>
            </div>

            {/* Vendeur */}
            {product.vendeur?.boutique_nom && (
              <div className="flex items-center gap-3 text-sm pt-2 border-t border-border">
                <Store size={18} className="text-gold-500" />
                Vendu par <span className="font-bold text-foreground">{product.vendeur.boutique_nom}</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Section "Produits similaires" enrichie */}
        {(similarProducts.length > 0 || similarLoading) && (
          <section className="mt-20">
            <Recommendations
              type="ai-personalized"
              title={similarityTitle}
              description={similarityDescription}
              products={similarProducts.length > 0 ? similarProducts : []}
              maxItems={4}
              seeMoreUrl={`/categories/${(product.categorie ?? '').split(' > ')[0]}`}
              cardVariant="compact"
            />
          </section>
        )}

        {/* Produits récemment vus */}
        {recentlyViewed.length > 1 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold font-serif mb-4">Vu récemment</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {recentlyViewed.slice(1, 5).map(pid => (
                <Link key={pid} href={`/produits/${pid}`} className="min-w-[150px]">
                  <Image src={product.images?.[0] || '/placeholder.jpg'} alt="" width={150} height={150} className="rounded-xl" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>

      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)}
        title={product.nom} description={product.description?.slice(0, 120)} image={product.images?.[0] || ''} />
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}