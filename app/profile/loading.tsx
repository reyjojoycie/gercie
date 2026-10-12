// app/profile/loading.tsx
import { Container } from '@/components/layout/Container'
import { Skeleton } from '@/components/ui/Skeleton'

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        {/* Back button skeleton */}
        <Skeleton className="h-5 w-24 mb-6" />

        <div className="space-y-8 max-w-6xl mx-auto">
          {/* Title skeleton */}
          <Skeleton className="h-10 w-48" />

          <div className="grid lg:grid-cols-[320px_1fr] gap-8">
            {/* Sidebar skeleton */}
            <div className="space-y-4">
              <div className="bg-card rounded-2xl p-6 border border-border">
                <div className="flex flex-col items-center space-y-4">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="mt-6 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
                <div className="mt-6 pt-6 border-t border-border space-y-3">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            </div>

            {/* Content skeleton */}
            <div className="space-y-6">
              {/* Section 1 */}
              <div className="bg-card rounded-2xl p-6 border border-border">
                <Skeleton className="h-6 w-48 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="bg-card rounded-2xl p-6 border border-border">
                <Skeleton className="h-6 w-40 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}