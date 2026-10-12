// app/nouveautes/loading.tsx
import { Container } from '@/components/layout/Container'
import { Skeleton } from '@/components/ui/Skeleton'

export default function NouveautesLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Squelette de l'en‑tête */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm">
        <Container className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="circular" className="w-10 h-10" shimmer shimmerVariant="gold" />
            <div>
              <Skeleton variant="text" className="w-48 h-7" shimmer shimmerVariant="gold" />
              <Skeleton variant="text" className="w-32 h-4 mt-1" shimmer shimmerVariant="gold" />
            </div>
          </div>
          <Skeleton variant="rectangular" className="w-28 h-9 rounded-xl" shimmer shimmerVariant="gold" />
        </Container>
      </div>

      <Container className="py-8">
        {/* Squelettes de la barre d'outils */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Skeleton variant="rectangular" className="w-full sm:w-64 h-10 rounded-full" shimmer shimmerVariant="gold" />
          <div className="flex gap-2">
            <Skeleton variant="rectangular" className="w-24 h-10 rounded-full" shimmer shimmerVariant="gold" />
            <Skeleton variant="rectangular" className="w-20 h-10 rounded-full" shimmer shimmerVariant="gold" />
            <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" shimmer shimmerVariant="gold" />
          </div>
        </div>

        {/* Squelettes des cartes */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border overflow-hidden">
              <Skeleton variant="rectangular" className="aspect-square w-full" shimmer shimmerVariant="gold" />
              <div className="p-4 space-y-3">
                <Skeleton variant="text" className="w-16 h-4 rounded-full" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="h-5 w-3/4" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="h-4 w-full" shimmer shimmerVariant="gold" />
                <div className="flex justify-between items-center pt-2">
                  <Skeleton variant="text" className="w-20 h-6" shimmer shimmerVariant="gold" />
                  <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" shimmer shimmerVariant="gold" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  )
}