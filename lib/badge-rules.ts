// lib/badge-rules.ts
import { ProductDetail } from '@/types/product' // à adapter selon vos types

export function computeAutoBadges(product: ProductDetail): string[] {
  const badges: string[] = []
  // Exemple : stock faible
  if (product.stock <= 5 && product.stock > 0) badges.push('stock-faible')
  // ... autres règles
  return badges
}