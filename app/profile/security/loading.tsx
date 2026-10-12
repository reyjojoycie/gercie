// app/profile/security/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function SecurityLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-3xl">
        <Skeleton className="h-4 w-40 mb-6" />

        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>

          {/* Score de sécurité */}
          <Card variant="glass" className="border-gold-400/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-72" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Liste des options */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 rounded-xl border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Container>
    </div>
  )
}