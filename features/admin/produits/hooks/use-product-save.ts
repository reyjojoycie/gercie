// features/admin/produits/hooks/use-product-save.ts
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import type { ProductAdminMode, ProductDetail, ProductDraft } from '../types'
import { sanitizePayload, removeProductDraft } from '../lib/product-utils'
import {
  createProduct,
  updateProduct,
  deleteProduct,
  duplicateProduct,
} from '../lib/product-api'

export interface UseProductSaveOptions {
  mode: ProductAdminMode
  productId?: string | null
  rate: number | null
  getValues: () => any
  onSaved?: () => void
  draftStorageKey?: string | null
}

export function useProductSave(options: UseProductSaveOptions) {
  const { mode, productId, rate, getValues, onSaved, draftStorageKey } = options
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<ProductDraft | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  /* ---------------------------------------------------------- */
  /* Mutation : créer ou mettre à jour                           */
  /* ---------------------------------------------------------- */
  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const prepared = sanitizePayload(values, rate)
      if (prepared.errors.length > 0) {
        throw new Error(prepared.errors.join(' • '))
      }
      if (mode === 'edit' && productId) {
        return updateProduct(productId, prepared.payload)
      }
      return createProduct(prepared.payload)
    },
    onMutate: () => setSubmitting(true),
    onSuccess: (data: ProductDetail) => {
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      if (draftStorageKey) {
        removeProductDraft(draftStorageKey)
      }
      onSaved?.()
      if (mode === 'create') {
        toast.addToast({
          type: 'success',
          message: 'Produit créé avec succès.',
        })
        const newId = data?.id
        if (newId) {
          router.push(`/admin/produits/${newId}/modifier`)
        } else {
          router.push('/admin/produits')
        }
      } else {
        toast.addToast({
          type: 'success',
          message: 'Produit mis à jour avec succès.',
        })
      }
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message:
          err?.message ||
          (mode === 'edit'
            ? 'Impossible de mettre à jour le produit.'
            : 'Impossible de créer le produit.'),
      })
    },
    onSettled: () => setSubmitting(false),
  })

  /* ---------------------------------------------------------- */
  /* Mutation : supprimer                                        */
  /* ---------------------------------------------------------- */
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error('ID produit manquant.')
      return deleteProduct(productId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      if (draftStorageKey) {
        removeProductDraft(draftStorageKey)
      }
      toast.addToast({ type: 'success', message: 'Produit supprimé.' })
      router.push('/admin/produits')
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Impossible de supprimer le produit.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Mutation : dupliquer                                        */
  /* ---------------------------------------------------------- */
  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error('ID produit manquant.')
      return duplicateProduct(productId)
    },
    onSuccess: (data: ProductDetail) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toast.addToast({
        type: 'success',
        message: 'Produit dupliqué avec succès.',
      })
      const newId = data?.id
      if (newId) {
        router.push(`/admin/produits/${newId}/modifier`)
      } else {
        router.push('/admin/produits')
      }
    },
    onError: (err: any) => {
      toast.addToast({
        type: 'error',
        message: err?.message || 'Impossible de dupliquer le produit.',
      })
    },
  })

  /* ---------------------------------------------------------- */
  /* Actions publiques                                           */
  /* ---------------------------------------------------------- */
  const submit = useCallback(() => {
    const values = getValues()
    if (!values) {
      toast.addToast({
        type: 'error',
        message: 'Formulaire indisponible.',
      })
      return
    }
    saveMutation.mutate(values)
  }, [getValues, saveMutation, toast])

  const openPreview = useCallback(() => {
    const values = getValues()
    if (!values) {
      toast.addToast({
        type: 'error',
        message: 'Formulaire indisponible.',
      })
      return
    }
    const prepared = sanitizePayload(values, rate)
    if (prepared.errors.length > 0) {
      toast.addToast({ type: 'error', message: prepared.errors[0] })
      return
    }
    setPreviewValues(values)
    setShowPreview(true)
  }, [getValues, rate, toast])

  const submitFromPreview = useCallback(() => {
    setShowPreview(false)
    submit()
  }, [submit])

  const handleDelete = useCallback(() => {
    deleteMutation.mutate()
  }, [deleteMutation])

  const handleDuplicate = useCallback(() => {
    duplicateMutation.mutate()
  }, [duplicateMutation])

  return {
    submitting,
    showPreview,
    setShowPreview,
    previewValues,
    showDeleteModal,
    setShowDeleteModal,
    submit,
    openPreview,
    submitFromPreview,
    handleDelete,
    handleDuplicate,
    deletePending: deleteMutation.isPending,
    duplicatePending: duplicateMutation.isPending,
    savePending: saveMutation.isPending,
  }
}