// app/profile/addresses/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function AddressesLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-3xl">
        <Skeleton className="h-4 w-40 mb-6" />

        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>

          <Card variant="glass" className="border-gold-400/20">
            <CardContent className="space-y-4 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Container>
    </div>
  )
}