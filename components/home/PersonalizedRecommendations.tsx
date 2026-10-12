// components/home/PersonalizedRecommendations.tsx
'use client'

import { motion } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import InfiniteCarouselRow from '@/components/product/InfiniteCarouselRow'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useFavorites } from '@/hooks/useFavorites'
import { useToast } from '@/components/ui/Toast'
import { usePersonalizedRecommendations } from '@/hooks/usePersonalizedRecommendations'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sparkles, Target, UserPlus, LogIn, RefreshCw, AlertTriangle,
} from 'lucide-react'

export default function PersonalizedRecommendations() {
  const { user } = useAuth()
  const pathname = usePathname()
  const { addToCart } = useCart()
  const { toggleFavorite, isFavorite } = useFavorites()
  const toast = useToast()

  const { products, loading, error, refresh } = usePersonalizedRecommendations(20)

  if (!user) {
    return (
      <section className="py-16 md:py-20 bg-gradient-to-br from-purple-900/20 to-pink-600/10">
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col items-center text-center max-w-md mx-auto"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/10 flex items-center justify-center mb-6 border border-purple-400/30">
              <Sparkles size={32} className="text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-serif mb-2">
              Des recommandations rien que pour vous
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-8">
              Connectez‑vous ou créez un compte pour recevoir des suggestions personnalisées basées sur vos goûts et votre historique.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
                <Button variant="luxe" leftIcon={<LogIn size={18} />} size="lg">
                  Se connecter
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline-gold" leftIcon={<UserPlus size={18} />} size="lg">
                  Créer un compte
                </Button>
              </Link>
            </div>
          </motion.div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-purple-900/20 to-pink-600/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-purple-400/30">
              <Target size={20} className="text-purple-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
              ✨ Recommandé pour vous
            </h2>
            <Badge variant="accent" size="sm">
              <Sparkles size={12} className="mr-1" /> IA
            </Badge>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm md:text-base">
            Basé sur vos recherches récentes et vos achats – défilez horizontalement
          </p>
        </motion.div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-midnight-800/40 rounded-2xl p-4 shadow-card">
                <Skeleton variant="rectangular" className="w-full aspect-square rounded-xl mb-3" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-3/4 mb-2" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-1/2" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-12 text-center">
            <AlertTriangle className="text-purple-500 mb-4" size={32} />
            <p className="text-sm text-muted-foreground mb-4">Impossible de charger vos recommandations.</p>
            <Button variant="outline-gold" size="sm" onClick={refresh} leftIcon={<RefreshCw size={16} />}>
              Réessayer
            </Button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Aucune recommandation personnalisée disponible pour le moment.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <InfiniteCarouselRow
            products={products}
            visibleItems={5}
            autoPlayInterval={false}
            compact={false}
            onQuickView={(id) => console.log('Aperçu', id)}
            onAddToCart={(id) => {
              addToCart(id, 1)
              toast.addToast({ type: 'success', message: 'Ajouté au panier' })
            }}
            onToggleFavorite={(id) => {
              toggleFavorite(id)
              const fav = isFavorite(id)
              toast.addToast({ type: fav ? 'success' : 'info', message: fav ? 'Ajouté aux favoris' : 'Retiré des favoris' })
            }}
            compareList={[]}
            onCompare={(id) => console.log('Comparer', id)}
            favorites={new Set()}
          />
        )}
      </Container>
    </section>
  )
}