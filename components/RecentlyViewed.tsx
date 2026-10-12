'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/components/ui/Toast'
import {
  History, Trash2, ShoppingCart, Clock, X, RefreshCw,
  Package, Star, List, Grid3X3, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
interface RecentItem {
  id: string
  timestamp: number
}

interface Product {
  id: string
  nom: string
  prix: number
  prix_promo?: number | null
  images: string[]
  categorie?: string
  note_moyenne?: number
  remise_percent?: number
}

/* ========================================================================== */
/*  Constantes                                                                  */
/* ========================================================================== */
const STORAGE_KEY = 'gercie_recent_products_v2'
const MAX_ITEMS = 6

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */
function getRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // migration depuis l'ancien format (tableau de strings)
      if (parsed.length > 0 && typeof parsed[0] === 'string') {
        const migrated = parsed.map((id: string) => ({ id, timestamp: Date.now() - 3600000 }))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      }
      return parsed as RecentItem[]
    }
    return []
  } catch {
    return []
  }
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

/* ========================================================================== */
/*  Composant                                                                  */
/* ========================================================================== */
export default function RecentlyViewed() {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid')
  const { addItem } = useCart()
  const toast = useToast()

  // Charger l'historique et les détails des produits
  useEffect(() => {
    const items = getRecentItems().slice(0, MAX_ITEMS)
    setRecentItems(items)

    if (items.length === 0) {
      setLoading(false)
      return
    }

    const ids = items.map(item => item.id).join(',')
    fetch(`/api/produits/batch?ids=${ids}`)
      .then(res => {
        if (!res.ok) throw new Error('Erreur chargement')
        return res.json()
      })
      .then((data: Product[]) => {
        const map = new Map(data.map(p => [p.id, p]))
        const ordered = items
          .map(item => map.get(item.id))
          .filter((p): p is Product => !!p)
        setProducts(ordered)
      })
      .catch(err => {
        console.warn('Batch API failed, using localStorage', err)
        setProducts(items.map(item => ({
          id: item.id,
          nom: `Produit ${item.id.slice(0, 8)}`,
          prix: 0,
          images: [],
        })))
      })
      .finally(() => setLoading(false))
  }, [])

  const removeItem = useCallback((productId: string) => {
    const updated = recentItems.filter(item => item.id !== productId)
    setRecentItems(updated)
    setProducts(prev => prev.filter(p => p.id !== productId))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }, [recentItems])

  const clearAll = useCallback(() => {
    setRecentItems([])
    setProducts([])
    localStorage.removeItem(STORAGE_KEY)
    toast.addToast({ type: 'info', message: 'Historique vidé' })
  }, [toast])

  const handleQuickAdd = useCallback((prod: Product, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem({
      id: prod.id,
      nom: prod.nom,
      prix: prod.prix_promo ?? prod.prix,
      quantite: 1,
      image: prod.images?.[0] || '/placeholder.jpg',
    })
    toast.addToast({ type: 'success', message: `${prod.nom} ajouté au panier` })
  }, [addItem, toast])

  // État de chargement
  if (loading) {
    return (
      <section className="py-12 md:py-16 bg-gradient-to-b from-background to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400/30 via-fuchsia-400/30 to-rose-400/30" />
        <Container>
          <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <History size={20} className="text-purple-500" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-serif">Récemment consultés</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="bg-card rounded-xl p-3 space-y-2">
                  <Skeleton variant="rectangular" className="aspect-square rounded-xl" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="w-3/4 h-4" shimmer shimmerVariant="gold" />
                  <Skeleton variant="text" className="w-1/2 h-4" shimmer shimmerVariant="gold" />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    )
  }

  // État d'erreur
  if (error && products.length === 0) {
    return (
      <section className="py-12 md:py-16 bg-gradient-to-b from-background to-muted/20 relative overflow-hidden">
        <Container>
          <div className="flex flex-col items-center py-10 text-center">
            <AlertTriangle size={40} className="text-amber-500 mb-3" />
            <p className="text-muted-foreground">Impossible de charger les produits récents.</p>
            <Button variant="outline-gold" size="sm" onClick={() => window.location.reload()} className="mt-4">
              <RefreshCw size={14} className="mr-1" /> Réessayer
            </Button>
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-background to-muted/20 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400/30 via-fuchsia-400/30 to-rose-400/30" />
      <Container>
        {/* En-tête */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2"
        >
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <History size={20} className="text-purple-500" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground font-serif">
                Récemment consultés
              </h2>
              {products.length > 0 && <Badge variant="neutral" size="sm">{products.length}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-1 hidden sm:block">
              Continuez votre exploration
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'carousel' : 'grid')}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-gold-500 hover:border-gold-400/50 transition-colors"
              title={viewMode === 'grid' ? 'Vue carrousel' : 'Vue grille'}
            >
              {viewMode === 'grid' ? <List size={16} /> : <Grid3X3 size={16} />}
            </button>
            {products.length > 0 && (
              <Tooltip content="Vider l'historique">
                <button
                  onClick={clearAll}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-400/50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip>
            )}
          </div>
        </motion.div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <History size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Vous n’avez consulté aucun produit récemment.</p>
            <p className="text-xs text-muted-foreground mt-1">Vos produits visités apparaîtront ici.</p>
            <Link href="/search" className="mt-4">
              <Button variant="outline-gold" size="sm">Découvrir le catalogue</Button>
            </Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {products.map((prod, idx) => {
              const recentItem = recentItems.find(item => item.id === prod.id)
              const discount = prod.remise_percent
                ? prod.remise_percent
                : prod.prix_promo && prod.prix > 0
                  ? Math.round(((prod.prix - prod.prix_promo) / prod.prix) * 100)
                  : 0
              return (
                <motion.div key={prod.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.05 }} whileHover={{ y: -4 }} className="group relative">
                  <Link href={`/produits/${prod.id}`} className="bg-card rounded-xl overflow-hidden hover:shadow-lg transition-shadow border border-border hover:border-gold-400/30 flex flex-col h-full">
                    <div className="aspect-square relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      {prod.images?.[0] ? (
                        <Image src={prod.images[0]} alt={prod.nom} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width: 768px) 50vw, 16vw" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package size={40} /></div>
                      )}
                      {discount > 0 && <Badge variant="danger" size="sm" className="absolute top-2 left-2 font-bold">-{discount}%</Badge>}
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(prod.id) }} className="absolute top-2 right-2 p-1 rounded-full bg-white/80 dark:bg-neutral-800/80 shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-500" aria-label="Retirer de l'historique"><X size={14} /></button>
                      {recentItem && (
                        <div className="absolute bottom-2 left-2 bg-white/80 dark:bg-neutral-800/80 rounded-full px-2 py-0.5 text-xs text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Clock size={10} />{timeAgo(recentItem.timestamp)}
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col justify-between flex-1">
                      <div>
                        <h3 className="text-sm font-medium line-clamp-2 group-hover:text-gold-600 transition-colors">{prod.nom}</h3>
                        {prod.categorie && <p className="text-xs text-muted-foreground mt-0.5">{prod.categorie}</p>}
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-bold text-gold-600">{(prod.prix_promo ?? prod.prix).toLocaleString()} FC</span>
                          {prod.prix_promo && <span className="text-xs text-muted-foreground line-through">{prod.prix.toLocaleString()} FC</span>}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          {prod.note_moyenne != null && prod.note_moyenne > 0 ? (
                            <div className="flex items-center gap-0.5"><Star size={12} className="text-amber-500 fill-amber-500" /><span>{prod.note_moyenne.toFixed(1)}</span></div>
                          ) : <span />}
                          <button onClick={(e) => handleQuickAdd(prod, e)} className="p-1 rounded-full text-muted-foreground hover:text-gold-500 hover:bg-gold-50 transition-colors" aria-label="Ajouter au panier"><ShoppingCart size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {products.map((prod, idx) => {
              const recentItem = recentItems.find(item => item.id === prod.id)
              const discount = prod.remise_percent ? prod.remise_percent : (prod.prix_promo && prod.prix > 0 ? Math.round(((prod.prix - prod.prix_promo) / prod.prix) * 100) : 0)
              return (
                <motion.div key={prod.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.05 }} className="min-w-[200px] w-[200px] flex-shrink-0 snap-start">
                  <Link href={`/produits/${prod.id}`} className="bg-card rounded-xl overflow-hidden hover:shadow-lg transition-shadow border border-border hover:border-gold-400/30 flex flex-col h-full group">
                    <div className="aspect-square relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      {prod.images?.[0] ? (
                        <Image src={prod.images[0]} alt={prod.nom} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="200px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package size={36} /></div>
                      )}
                      {discount > 0 && <Badge variant="danger" size="sm" className="absolute top-2 left-2 font-bold">-{discount}%</Badge>}
                      {recentItem && <div className="absolute bottom-2 left-2 bg-white/80 dark:bg-neutral-800/80 rounded-full px-2 py-0.5 text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} />{timeAgo(recentItem.timestamp)}</div>}
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-medium truncate">{prod.nom}</h3>
                      <span className="text-gold-600 font-bold">{(prod.prix_promo ?? prod.prix).toLocaleString()} FC</span>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </Container>
    </section>
  )
}