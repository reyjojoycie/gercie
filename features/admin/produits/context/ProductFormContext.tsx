// features/admin/produits/context/ProductFormContext.tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ProductFormState } from '../hooks/use-product-form-state'
import type { ProductAdminMode } from '../types'

interface ProductFormContextValue {
  form: ProductFormState
  mode: ProductAdminMode
  productId?: string | null
  rate: number | null
  rateLoading: boolean
}

const ProductFormContext = createContext<ProductFormContextValue | null>(null)

export function ProductFormProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ProductFormContextValue
}) {
  return (
    <ProductFormContext.Provider value={value}>
      {children}
    </ProductFormContext.Provider>
  )
}

export function useProductFormContext(): ProductFormContextValue {
  const ctx = useContext(ProductFormContext)
  if (!ctx) {
    throw new Error(
      'useProductFormContext must be used within ProductFormProvider'
    )
  }
  return ctx
}

/* ---------------------------------------------------------- */
/* Hook pratique pour les composants d'étapes                  */
/* ---------------------------------------------------------- */
export function useStepContext() {
  const { form, mode, productId, rate } = useProductFormContext()
  return { form, mode, productId, rate }
}