// app/register/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function RegisterLoading() {
  return (
    <div
      className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">
        Chargement de la page d’inscription…
      </span>

      <Container size="small" className="max-w-md w-full">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader className="text-center">
            <Skeleton
              variant="circular"
              className="h-14 w-14 mx-auto mb-4"
            />

            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>

            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />

            <Skeleton className="h-12 w-full mt-4" />
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}