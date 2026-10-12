'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Container } from '@/components/layout/Container';
import InfiniteCarouselRow from '@/components/product/InfiniteCarouselRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertTriangle, RefreshCw, Flame } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function TrendingSection() {
  const { data: products, isLoading, isError, refetch } = useQuery({
    queryKey: ['trending-section'],
    queryFn: async () => {
      // Récupérer 20 produits pour permettre le défilement infini fluide
      const res = await fetch('/api/produits?sort_by=total_ventes&limit=20&est_actif=true');
      if (!res.ok) throw new Error('Erreur chargement');
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 120_000,
  });

  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-amber-900/20 to-amber-600/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-amber-400/30">
              <Flame size={20} className="text-amber-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100 font-serif">
              🔥 Tendances du moment
            </h2>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm md:text-base">
            Les produits les plus populaires en ce moment – défilez horizontalement
          </p>
        </motion.div>

        {isLoading && (
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

        {isError && (
          <div className="flex flex-col items-center py-12 text-center">
            <AlertTriangle className="text-amber-500 mb-4" size={32} />
            <p className="text-sm text-muted-foreground mb-4">Impossible de charger les tendances.</p>
            <Button variant="outline-gold" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw size={16} />}>
              Réessayer
            </Button>
          </div>
        )}

        {!isLoading && !isError && (!products || products.length === 0) && (
          <p className="text-center text-muted-foreground py-12">Aucune tendance pour le moment.</p>
        )}

        {!isLoading && !isError && products && products.length > 0 && (
          <InfiniteCarouselRow
            products={products}
            visibleItems={5}
            autoPlayInterval={false}
            compact={false}
            // Vous pouvez ajouter des callbacks si besoin (panier, favoris...)
          />
        )}
      </Container>
    </section>
  );
}