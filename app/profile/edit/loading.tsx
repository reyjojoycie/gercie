// app/profile/edit/loading.tsx
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function ProfileEditLoading() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Container className="py-8">
        <Skeleton className="h-5 w-24 mb-6" />

        <div className="max-w-3xl mx-auto space-y-8">
          <Skeleton className="h-10 w-64" />

          <Card className="border-border">
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-10 w-32 rounded-lg" />
                  <Skeleton className="h-10 w-24 rounded-lg" />
                </div>
              </div>

              {/* Champs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>

              <div className="flex gap-3 pt-4">
                <Skeleton className="h-12 w-32 rounded-lg" />
                <Skeleton className="h-12 w-32 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </div>
  )
}