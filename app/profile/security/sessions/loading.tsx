// app/profile/security/sessions/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function SessionsLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 py-8 px-4">
      <Container size="small" className="max-w-2xl">
        <Skeleton className="h-4 w-40 mb-6" />

        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 flex items-center gap-3 border border-neutral-200 dark:border-neutral-700"
              >
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-1/2 h-4" />
                  <Skeleton className="w-3/4 h-3" />
                </div>
                <Skeleton className="w-20 h-8 rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-10 w-full rounded-xl mt-4" />
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}