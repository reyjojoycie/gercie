// app/admin/produits/[id]/modifier/page.tsx
'use client'

import { useParams } from 'next/navigation'
import ProductAdminPage from '@/features/admin/produits/components/ProductAdminPage'

export default function ModifierProduitPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id

  return <ProductAdminPage mode="edit" productId={id} />
}