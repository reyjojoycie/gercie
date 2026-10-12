// app/login/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function LoginLoading() {
  return (
    <div
      className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Chargement de la page de connexion…</span>

      <Container size="small" className="max-w-md w-full">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader className="text-center">
            <Skeleton variant="circular" className="h-14 w-14 mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-12 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
            </div>

            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>

            <Skeleton className="h-12 w-full mt-4" />

            <div className="pt-4">
              <div className="flex items-center gap-4 justify-center">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}