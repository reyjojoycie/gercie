// features/admin/produits/lib/product-api.ts

import type { ProductDetail, ProductDraft } from '../types'

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T
}

async function parseResponseError(res: Response, fallback: string) {
  const json = await res.json().catch(() => ({}))
  throw new Error(json?.error || fallback)
}

export async function fetchProductById(id: string): Promise<ProductDetail> {
  if (!id) throw new Error('ID produit manquant.')

  const res = await fetch(`/api/admin/produits/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseResponseError(res, 'Produit introuvable.')
  }

  const json = await res.json().catch(() => ({}))
  return unwrap<ProductDetail>(json)
}

export async function createProduct(
  payload: ProductDraft
): Promise<ProductDetail> {
  const res = await fetch('/api/admin/produits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    await parseResponseError(res, 'Erreur lors de la création du produit.')
  }

  const json = await res.json().catch(() => ({}))
  return unwrap<ProductDetail>(json)
}

export async function updateProduct(
  id: string,
  payload: ProductDraft
): Promise<ProductDetail> {
  if (!id) throw new Error('ID produit manquant.')

  const res = await fetch(`/api/admin/produits/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    await parseResponseError(res, 'Erreur lors de la mise à jour.')
  }

  const json = await res.json().catch(() => ({}))
  return unwrap<ProductDetail>(json)
}

export async function deleteProduct(id: string): Promise<any> {
  if (!id) throw new Error('ID produit manquant.')

  const res = await fetch(`/api/admin/produits/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    await parseResponseError(res, 'Erreur lors de la suppression.')
  }

  return res.json().catch(() => ({}))
}

export async function duplicateProduct(id: string): Promise<ProductDetail> {
  if (!id) throw new Error('ID produit manquant.')

  const res = await fetch(`/api/admin/produits/${id}/duplicate`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    await parseResponseError(res, 'Erreur lors de la duplication.')
  }

  const json = await res.json().catch(() => ({}))
  return unwrap<ProductDetail>(json)
}