// app/panier/page.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Recommendations } from '@/components/Recommendations'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowLeft,
  Tag,
  ShieldCheck,
  Truck,
  Sparkles,
  Loader2,
  AlertTriangle,
  Heart,
  RefreshCw,
  Gift,
  ChevronRight,
  Bookmark,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function CartPage() {
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    total,
    itemCount,
    loading,
    isSyncing,
    error,
    refetchCart,
    summary,
    undoRemove,
    saveForLater,
    savedItems,
    moveToCart,
  } = useCart()
  const { rate } = useExchangeRate()
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()

  const [confirmClear, setConfirmClear] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const getVariantKey = useCallback((item: any): string | undefined => {
    return item.variante ? JSON.stringify(item.variante.attributes) : undefined
  }, [])

  const getVariantDisplay = useCallback((item: any) => {
    if (!item.variante?.attributes) return null
    return Object.entries(item.variante.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')
  }, [])

  const handleUndo = async () => {
    await undoRemove()
  }

  const handleClearCart = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    await clearCart()
    setConfirmClear(false)
  }

  // Si pas encore monté, éviter le mismatch de rendu
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    )
  }

  // Panier vide
  if (!loading && items.length === 0 && savedItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 w-24 h-24 rounded-full bg-gold-400/10 dark:bg-gold-400/5 flex items-center justify-center border border-gold-400/30">
            <ShoppingBag className="w-12 h-12 text-gold-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-serif mb-2">Votre panier est vide</h1>
          <p className="text-muted-foreground mb-8">Découvrez notre catalogue et ajoutez vos coups de cœur.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/"><Button variant="luxe" size="lg" className="shadow-gold">Explorer le catalogue</Button></Link>
            <Link href="/profile/favoris"><Button variant="outline-gold" size="lg">Mes favoris</Button></Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <Container className="py-8 md:py-12">
        {/* Fil d'ariane */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-gold-500 transition-colors">
            <ArrowLeft size={16} /> Accueil
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">Panier</span>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <Link href="/profile/favoris" className="text-xs text-gold-500 hover:text-gold-400 flex items-center gap-1">
                <Heart size={14} /> Favoris
              </Link>
            ) : (
              <Link href="/login?redirect=/panier" className="text-xs text-gold-500 hover:text-gold-400">
                Se connecter
              </Link>
            )}
            <Link href="/search" className="text-xs text-gold-500 hover:text-gold-400">
              Continuer mes achats
            </Link>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => refetchCart()} className="ml-auto text-xs text-red-600 hover:text-red-800 underline">Réessayer</button>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-foreground font-serif">Mon panier</h1>
              <p className="text-muted-foreground mt-1.5">
                {itemCount} article{itemCount > 1 ? 's' : ''} · {summary.sousTotal.toLocaleString()} FC
                {isSyncing && <Loader2 size={12} className="animate-spin inline ml-2 text-gold-500" />}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {items.length > 0 && (
                <button onClick={handleClearCart}
                  className={cn('text-sm flex items-center gap-1.5 transition-colors', confirmClear ? 'text-red-500 font-semibold' : 'text-muted-foreground hover:text-red-500')}>
                  {confirmClear ? <><AlertTriangle size={14} /> Confirmer ?</> : <><Trash2 size={14} /> Vider le panier</>}
                </button>
              )}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-gold-600">{summary.total.toLocaleString()} FC</p>
                {summary.totalUSD && <p className="text-xs text-muted-foreground">≈ {summary.totalUSD.toFixed(2)} USD</p>}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Liste des articles */}
            <div className="lg:col-span-2 space-y-4">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <Card key={i} className="p-4 border-gold-400/20">
                    <div className="flex gap-4">
                      <Skeleton variant="rectangular" className="w-24 h-24 rounded-xl" shimmer shimmerVariant="gold" />
                      <div className="flex-1 space-y-2">
                        <Skeleton variant="text" className="w-3/4 h-5" shimmer shimmerVariant="gold" />
                        <Skeleton variant="text" className="w-1/3 h-4" shimmer shimmerVariant="gold" />
                        <div className="flex gap-3 mt-3">
                          <Skeleton variant="rectangular" className="w-24 h-10 rounded-full" shimmer shimmerVariant="gold" />
                          <Skeleton variant="text" className="w-16 h-4" shimmer shimmerVariant="gold" />
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        <Skeleton variant="text" className="w-20 h-5 ml-auto" shimmer shimmerVariant="gold" />
                        <Skeleton variant="text" className="w-16 h-4 ml-auto" shimmer shimmerVariant="gold" />
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <AnimatePresence>
                  {items.map((item, idx) => {
                    const variantKey = getVariantKey(item)
                    const variantDisplay = getVariantDisplay(item)
                    const itemTotal = item.prix * item.quantite
                    return (
                      <motion.div
                        key={`${item.id}-${variantKey ?? ''}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, height: 0 }}
                        transition={{ delay: idx * 0.03 }}
                      >
                        <Card hover className="p-4 md:p-5 border-gold-400/20 group">
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative w-full sm:w-24 h-24 bg-neutral-100 dark:bg-midnight-700/40 rounded-xl overflow-hidden flex-shrink-0">
                              {item.image ? (
                                <Link href={`/produits/${item.id}`}>
                                  <Image src={item.image} alt={item.nom} fill className="object-contain p-3 group-hover:scale-105 transition-transform" sizes="96px" />
                                </Link>
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground"><ShoppingBag size={24} /></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <Link href={`/produits/${item.id}`}>
                                <h3 className="font-semibold text-foreground hover:text-gold-500 transition-colors truncate">{item.nom}</h3>
                              </Link>
                              {variantDisplay && <p className="text-xs text-gold-600 mt-0.5">{variantDisplay}</p>}
                              {item.remise && item.remise > 0 && (
                                <Badge variant="danger" size="sm" className="mt-1">-{item.remise}%</Badge>
                              )}
                              <div className="flex flex-wrap items-center gap-3 mt-3">
                                <div className="flex items-center gap-1 bg-muted rounded-full p-1 shadow-inner border border-gold-400/20">
                                  <button onClick={() => updateQuantity(item.id, item.quantite - 1, variantKey)} disabled={item.quantite <= 1 || isSyncing}
                                    className="w-8 h-8 rounded-full bg-white dark:bg-midnight-800 hover:bg-gold-400/10 flex items-center justify-center transition-all disabled:opacity-40" aria-label="Diminuer">
                                    <Minus size={14} className="text-muted-foreground" />
                                  </button>
                                  <span className="w-10 text-center text-sm font-semibold tabular-nums">{item.quantite}</span>
                                  <button onClick={() => updateQuantity(item.id, item.quantite + 1, variantKey)} disabled={isSyncing || (item.stock && item.quantite >= item.stock)}
                                    className="w-8 h-8 rounded-full bg-white dark:bg-midnight-800 hover:bg-gold-400/10 flex items-center justify-center transition-all" aria-label="Augmenter">
                                    <Plus size={14} className="text-muted-foreground" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Tooltip content="Sauvegarder pour plus tard">
                                    <button onClick={() => saveForLater(item.id, variantKey)} className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 transition-colors">
                                      <Bookmark size={16} />
                                    </button>
                                  </Tooltip>
                                  <button onClick={() => removeItem(item.id, variantKey)} disabled={isSyncing}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50" aria-label="Retirer">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                                {isSyncing && <Loader2 size={14} className="animate-spin text-gold-500" />}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 flex flex-col items-end justify-between">
                              <div>
                                <p className="text-lg font-bold text-gold-600">{itemTotal.toLocaleString()} FC</p>
                                {item.quantite > 1 && <p className="text-xs text-muted-foreground">{item.prix.toLocaleString()} FC / unité</p>}
                                {rate && <p className="text-xs text-gold-500">≈ {(itemTotal / rate).toFixed(2)} USD</p>}
                              </div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              )}

              {/* Articles sauvegardés pour plus tard */}
              {savedItems.length > 0 && (
                <div className="mt-6">
                  <button onClick={() => setShowSaved(!showSaved)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-gold-500 transition-colors">
                    <Bookmark size={16} />
                    Sauvegardés pour plus tard ({savedItems.length})
                    <ChevronRight size={16} className={cn('transition-transform', showSaved && 'rotate-90')} />
                  </button>
                  <AnimatePresence>
                    {showSaved && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3 space-y-3">
                        {savedItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-3 bg-card border border-border rounded-xl">
                            <Image src={item.image || '/placeholder.jpg'} alt={item.nom} width={48} height={48} className="rounded-lg object-cover" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.nom}</p>
                              <p className="text-xs text-muted-foreground">{item.prix.toLocaleString()} FC</p>
                            </div>
                            <Button variant="outline-gold" size="sm" onClick={() => moveToCart(item.id, getVariantKey(item))}>
                              <ShoppingCart size={14} className="mr-1" /> Remettre
                            </Button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Résumé */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24 border-2 border-gold-400/20 bg-white/70 dark:bg-midnight-800/60 backdrop-blur-xl shadow-gold">
                <CardContent className="p-6 space-y-5">
                  <h2 className="font-bold text-xl text-foreground flex items-center gap-2 font-serif">
                    <Tag size={20} className="text-gold-500" /> Récapitulatif
                  </h2>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Sous‑total ({itemCount} article{itemCount > 1 ? 's' : ''})</span>
                      <span className="font-semibold text-foreground">{summary.sousTotal.toLocaleString()} FC</span>
                    </div>
                    {/* Réduction si un code promo est actif (appliqué depuis la commande) */}
                    {summary.remiseTotal > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Réduction</span>
                        <span>-{summary.remiseTotal.toLocaleString()} FC</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Livraison estimée</span>
                      <span>{summary.fraisLivraison === 0 ? 'Gratuite' : `${summary.fraisLivraison.toLocaleString()} FC`}</span>
                    </div>
                    {summary.totalUSD && (
                      <div className="flex justify-between text-muted-foreground text-xs">
                        <span>Soit en USD</span>
                        <span>{summary.totalUSD.toFixed(2)} USD</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gold-400/20 pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-gold-600">{summary.total.toLocaleString()} FC</span>
                    </div>
                  </div>

                  {/* Pas de section code promo dans le panier – elle se trouve sur la page commande */}

                  <Button
                    variant="luxe"
                    fullWidth
                    size="lg"
                    className="shadow-gold hover:shadow-glow-gold animate-glow-pulse transform hover:scale-[1.02] transition-all"
                    disabled={isSyncing || items.length === 0}
                    onClick={() => router.push('/commande')}
                  >
                    Passer la commande
                  </Button>

                  <div className="space-y-2 pt-2 border-t border-gold-400/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck size={14} className="text-gold-500" /> Paiement 100 % sécurisé
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Truck size={14} className="text-gold-500" /> Livraison suivie
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw size={14} className="text-gold-500" /> Retours gratuits sous 7 jours
                    </div>
                  </div>

                  <Link href="/profile/commandes" className="block text-center text-sm text-muted-foreground hover:text-gold-500 transition-colors">
                    Voir mes commandes
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Suggestions */}
          {!loading && items.length > 0 && (
            <div className="mt-16">
              <Recommendations
                type="similar-to-cart"
                title="Complétez votre panier"
                description="Ces produits pourraient vous plaire"
                maxItems={4}
              />
            </div>
          )}
        </motion.div>
      </Container>
      <ScrollToTop variant="circle" showProgress />
    </div>
  )
}