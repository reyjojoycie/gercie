// app/reset-password/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function ResetPasswordLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader className="text-center">
            <Skeleton className="h-14 w-14 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-56 mx-auto mb-2" />
            <Skeleton className="h-4 w-72 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-12 w-full mt-4" />
          </CardContent>
        </Card>
      </Container>
    </div>
  )
}