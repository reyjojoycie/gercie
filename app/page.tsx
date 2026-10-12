'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { Container } from '@/components/layout/Container';
import { ProductGrid } from '@/components/ProductGrid';
import { useProductFilters } from '@/hooks/useProductFilters';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';
import { useInView } from 'react-intersection-observer';
import { Modal } from '@/components/ui/Modal';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ScrollToTop, ScrollProgressBar } from '@/components/ui/ScrollToTop';
import { useCart } from '@/contexts/CartContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useHeroCarousel } from '@/hooks/useHeroCarousel';
import { useAuth } from '@/contexts/AuthContext'; // ✅ NOUVEAU

// Sections extraites
import PromoBanner from '@/components/home/PromoBanner';
import PopularCategoriesSection from '@/components/home/PopularCategoriesSection';
import TodaysDeals from '@/components/home/TodaysDeals';
import BestSellers from '@/components/home/BestSellers';
import NewArrivals from '@/components/home/NewArrivals';
import TrendingSection from '@/components/home/TrendingSection';
import PersonalizedRecommendations from '@/components/home/PersonalizedRecommendations';
import RecentlyViewed from '@/components/RecentlyViewed';
import TrustSection from '@/components/home/TrustSection';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import FooterReassurance from '@/components/home/FooterReassurance';
import HomeErrorBoundary from '@/components/home/HomeErrorBoundary';

// Import du carrousel hero
import { HeroCarousel } from '@/components/home/HeroCarousel';

// Chargement dynamique pour optimiser le bundle initial
const DynamicProductQuickView = dynamic(() => import('@/components/ProductQuickView'), {
  ssr: false,
  loading: () => null,
});

const DynamicShareModal = dynamic(() => import('@/components/ShareModal'), {
  ssr: false,
  loading: () => null,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
  },
});

const FallbackProductQuickView = ({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) => {
  const { addToCart } = useCart();
  const { addToast } = useToast();

  const handleAddToCart = useCallback(() => {
    addToCart(productId, 1);
    addToast({ type: 'success', message: 'Produit ajouté au panier' });
    onClose();
  }, [productId, addToCart, addToast, onClose]);

  return (
    <Modal isOpen={true} onClose={onClose} title="Aperçu rapide" size="lg" accent="gold">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/2 aspect-square bg-neutral-200 dark:bg-midnight-800 rounded-xl animate-pulse" />
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <p className="text-2xl font-bold mb-2">Produit #{productId.slice(0, 8)}</p>
            <p className="text-muted-foreground mb-4">
              Chargement des détails en cours...
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            <Button variant="luxe" onClick={handleAddToCart}>
              Ajouter au panier
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

function HomeContent() {
  const router = useRouter();
  const { user, loading: authLoading, isOnboarded, isVerified } = useAuth(); // ✅ NOUVEAU

  const filters = useProductFilters();
  const {
    products = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProducts({
    search: filters.debouncedSearch || undefined,
    categorie_prefix: useMemo(() => {
      if (filters.selectedDetail) {
        return `${filters.selectedMainCategory} > ${filters.selectedSubCategory} > ${filters.selectedType} > ${filters.selectedDetail}`;
      }
      if (filters.selectedType) {
        return `${filters.selectedMainCategory} > ${filters.selectedSubCategory} > ${filters.selectedType}`;
      }
      if (filters.selectedSubCategory) {
        return `${filters.selectedMainCategory} > ${filters.selectedSubCategory}`;
      }
      return filters.selectedMainCategory || undefined;
    }, [
      filters.selectedMainCategory,
      filters.selectedSubCategory,
      filters.selectedType,
      filters.selectedDetail,
    ]),
    min_price: filters.minPrice || undefined,
    max_price: filters.maxPrice || undefined,
    sort_by: filters.sortBy,
    sort_order: filters.sortOrder,
  });

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [viewMode] = useState<'grid' | 'list'>('grid');
  const [compareList, setCompareList] = useState<string[]>([]);
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null);

  const {
    slides: heroSlides,
    settings: heroSettings,
    loading: heroLoading,
    error: heroError,
  } = useHeroCarousel();

  const { addToCart } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToast } = useToast();

  const { ref: recosRef, inView: recosInView } = useInView({
    triggerOnce: true,
    rootMargin: '200px',
    threshold: 0.1,
  });

  // ✅ NOUVEAU : Vérification côté client de l'onboarding
  useEffect(() => {
    // Attendre que l'authentification soit chargée
    if (authLoading) return;

    // Si l'utilisateur est connecté mais n'a pas complété l'onboarding
    if (user && (!isOnboarded || !isVerified)) {
      console.log('[HomeContent] 🚫 Redirection vers onboarding:', {
        user: user.id,
        isOnboarded,
        isVerified,
      });
      router.replace('/onboarding');
    }
  }, [user, authLoading, isOnboarded, isVerified, router]);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setShowScrollTop(window.scrollY > 600);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCompare = useCallback(
    (productId: string) => {
      setCompareList((prev) => {
        const isAlreadyInList = prev.includes(productId);

        if (isAlreadyInList) {
          addToast({ type: 'info', message: 'Produit retiré du comparateur' });
          return prev.filter((id) => id !== productId);
        }

        if (prev.length < 4) {
          addToast({ type: 'info', message: 'Produit ajouté au comparateur' });
          return [...prev, productId];
        }

        addToast({
          type: 'warning',
          message: 'Maximum 4 produits dans le comparateur',
        });
        return prev;
      });
    },
    [addToast],
  );

  const handleAddToCart = useCallback(
    (id: string) => {
      addToCart(id, 1);
      addToast({ type: 'success', message: 'Produit ajouté au panier' });
    },
    [addToCart, addToast],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => {
      const wasFavorite = isFavorite(id);
      toggleFavorite(id);

      addToast({
        type: wasFavorite ? 'info' : 'success',
        message: wasFavorite ? 'Retiré des favoris' : 'Ajouté aux favoris',
      });
    },
    [toggleFavorite, isFavorite, addToast],
  );

  const handleCloseQuickView = useCallback(() => {
    setQuickViewProductId(null);
  }, []);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleResetFilters = useCallback(() => {
    filters.resetFilters();
  }, [filters]);

  const renderHero = useCallback(() => {
    if (heroLoading) {
      return (
        <div
          className="w-full aspect-[2/1] md:aspect-[3/1] bg-neutral-200 dark:bg-midnight-800 animate-pulse flex items-center justify-center"
          role="status"
          aria-label="Chargement du carrousel"
        >
          <Loader2 size={32} className="animate-spin text-gold-500" aria-hidden="true" />
          <span className="sr-only">Chargement du carrousel...</span>
        </div>
      );
    }

    if (heroError) {
      return (
        <div className="w-full py-20 text-center" role="alert">
          <AlertTriangle
            className="mx-auto text-red-500 mb-4"
            size={32}
            aria-hidden="true"
          />
          <p className="text-muted-foreground mb-4">
            Impossible de charger le carrousel
          </p>
          <Button
            variant="outline-gold"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-2"
          >
            Réessayer
          </Button>
        </div>
      );
    }

    if (heroSlides.length === 0) {
      return (
        <div className="w-full py-20 text-center">
          <p className="text-xl md:text-2xl font-medium text-muted-foreground italic tracking-wide">
            Rien à l'horizon
          </p>
        </div>
      );
    }

    return (
      <HeroCarousel
        slides={heroSlides}
        direction={heroSettings.direction}
        intervalMs={heroSettings.interval_ms}
        autoplayEnabled={heroSettings.autoplay_enabled}
      />
    );
  }, [heroLoading, heroError, heroSlides, heroSettings]);

  const productsCount = useMemo(() => {
    const count = products.length;
    return {
      count,
      text: `${count} produit${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`,
    };
  }, [products.length]);

  // ✅ NOUVEAU : Afficher un loader pendant la vérification
  if (authLoading || (user && (!isOnboarded || !isVerified))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-gold-500 mx-auto" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Vérification du compte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <ScrollProgressBar color="var(--color-gold-500)" height={3} />

      <HomeErrorBoundary>
        <PromoBanner />
      </HomeErrorBoundary>

      <section
        className="relative w-full bg-neutral-50 dark:bg-neutral-900 border-b border-border"
        aria-label="Bannière principale"
      >
        {renderHero()}
      </section>

      <HomeErrorBoundary>
        <PopularCategoriesSection />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <TodaysDeals />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <BestSellers />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <NewArrivals />
      </HomeErrorBoundary>

      <Container className="py-8 md:py-12 min-h-[50vh]">
        <div className="flex items-center justify-between mb-6">
          <div>
            {!isLoading && !isFetching && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <span className="font-semibold text-foreground">
                  {productsCount.count}
                </span>{' '}
                {productsCount.text}
              </p>
            )}

            {(isLoading || isFetching) && (
              <p
                className="text-sm text-muted-foreground animate-pulse flex items-center gap-2"
                role="status"
              >
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span>Chargement...</span>
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>Erreur</span>
              <Button variant="outline-gold" size="sm" onClick={handleRefetch}>
                Réessayer
              </Button>
            </div>
          )}
        </div>

        <ProductGrid
          products={products}
          loading={isLoading}
          error={error ?? undefined}
          onRetry={handleRefetch}
          emptyState={{
            title: 'Aucun produit trouvé',
            description: "Essayez d'autres critères ou explorez notre catalogue.",
            actionLabel: 'Voir tout le catalogue',
            onAction: handleResetFilters,
          }}
          viewMode={viewMode}
          animated
          showQuickSort
          onQuickView={setQuickViewProductId}
          onAddToCart={handleAddToCart}
          onToggleFavorite={handleToggleFavorite}
          compareList={compareList}
          onCompare={toggleCompare}
          carouselRows={true}
          itemsPerRow={5}
          maxRows={3}
          carouselAutoPlay={5000}
        />
      </Container>

      <div ref={recosRef} aria-hidden={!recosInView}>
        {recosInView && (
          <>
            <HomeErrorBoundary>
              <TrendingSection />
            </HomeErrorBoundary>

            <HomeErrorBoundary>
              <PersonalizedRecommendations />
            </HomeErrorBoundary>
          </>
        )}
      </div>

      <HomeErrorBoundary>
        <RecentlyViewed />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <TrustSection />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <TestimonialsSection />
      </HomeErrorBoundary>

      <HomeErrorBoundary>
        <FooterReassurance />
      </HomeErrorBoundary>

      {quickViewProductId && (
        <DynamicProductQuickView
          productId={quickViewProductId}
          onClose={handleCloseQuickView}
        />
      )}

      {showScrollTop && (
        <ScrollToTop variant="circle" showProgress tooltip="Retour en haut" />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HomeContent />
      </ToastProvider>
    </QueryClientProvider>
  );
}