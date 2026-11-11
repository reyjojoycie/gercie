// features/admin/produits/components/ProductAdminSkeleton.tsx
'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import { Container } from '@/components/layout/Container'

export default function ProductAdminSkeleton() {
  return (
    <Container className="py-8">
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-[620px] lg:col-span-2" />
          <Skeleton className="h-[620px]" />
        </div>
      </div>
    </Container>
  )
}